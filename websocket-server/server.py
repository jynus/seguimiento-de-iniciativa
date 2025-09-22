#!/usr/bin/env python3
import asyncio
import contextlib
import json
import logging
import os
import signal
import ssl
import sys
from argparse import ArgumentParser
from typing import Any, Dict, Optional

import websockets

LOG = logging.getLogger("ws-broadcast")

# Estado compartido
clients: Dict[object, str] = {}  # ws -> role ("admin"|"viewer")
last_state: Optional[dict] = None  # último "state" recibido desde el admin


async def broadcast(payload: Any, exclude: Optional[object] = None) -> int:
    """
    Envía `payload` (dict/list -> JSON, o str) a todos los clientes conectados,
    excepto `exclude` si se indica. Limpia clientes caídos.
    Devuelve cuántos destinatarios se intentaron.
    """
    message = json.dumps(payload, separators=(",", ":")) if isinstance(payload, (dict, list)) else str(payload)

    # Snapshot para evitar desalineos si `clients` cambia durante el envío
    targets = [ws for ws in tuple(clients) if ws is not exclude]
    if not targets:
        return 0

    tasks = [asyncio.create_task(ws.send(message)) for ws in targets]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Limpieza de los que hayan fallado
    for ws, res in zip(targets, results):
        if isinstance(res, Exception):
            LOG.warning("Fallo al enviar a %s: %s", getattr(ws, "remote_address", "?"), res)
            clients.pop(ws, None)
            with contextlib.suppress(Exception):
                await ws.close()

    return len(targets)


async def handle_client(ws, admin_token: Optional[str]):
    """
    Protocolo de mensajes:
      - Client -> Server: {"type":"hello","role":"admin"|"viewer","token":"...?"}
      - Admin -> Server : {"type":"state","state":{...}}   (se difunde a todos)
    """
    global last_state

    role = "viewer"  # por defecto hasta recibir HELLO
    clients[ws] = role
    peer = ws.remote_address
    LOG.info("Conexión nueva desde %s", peer)

    try:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                LOG.warning("JSON inválido de %s: %r", peer, raw[:200])
                await ws.send(json.dumps({"type": "error", "error": "invalid_json"}))
                continue

            mtype = msg.get("type")
            if mtype == "hello":
                role = (msg.get("role") or "viewer").lower()
                # Validación simple para admin opcional
                if role == "admin" and admin_token:
                    if msg.get("token") != admin_token:
                        LOG.warning("Admin rechazado por token incorrecto de %s", peer)
                        await ws.send(json.dumps({"type": "error", "error": "unauthorized"}))
                        # degradar a viewer o cerrar; elegimos cerrar:
                        await ws.close(code=4001, reason="unauthorized")
                        clients.pop(ws, None)
                        return
                clients[ws] = role
                LOG.info("HELLO %s (%s)", peer, role)
                # Si hay un estado previo, envíalo al cliente que acaba de llegar (especialmente viewers)
                if last_state is not None:
                    await ws.send(json.dumps({"type": "state", "state": last_state}, separators=(",", ":")))
                continue

            if mtype == "state":
                if clients.get(ws) != "admin":
                    LOG.warning("STATE ignorado de %s (no admin)", peer)
                    await ws.send(json.dumps({"type": "error", "error": "forbidden"}))
                    continue
                state = msg.get("state")
                if not isinstance(state, dict):
                    await ws.send(json.dumps({"type": "error", "error": "invalid_state"}))
                    continue
                # Guarda y difunde
                last_state = state
                LOG.debug("Broadcast state (%d bytes)", len(json.dumps(state)))
                await broadcast({"type": "state", "state": state})
                continue

            # Mensajes opcionales (pings, etc.)
            if mtype == "ping":
                await ws.send(json.dumps({"type": "pong"}))
                continue

            # Desconocido
            await ws.send(json.dumps({"type": "error", "error": "unknown_type"}))

    except websockets.ConnectionClosed:
        LOG.info("Conexión cerrada: %s", peer)
    except Exception as e:
        LOG.exception("Error con %s: %s", peer, e)
    finally:
        clients.pop(ws, None)


async def ping_loop(interval: int = 20):
    """Mantiene vivas las conexiones con pings periódicos."""
    while True:
        await asyncio.sleep(interval)
        dead = []
        for ws in list(clients.keys()):
            try:
                pong_waiter = await ws.ping()
                await asyncio.wait_for(pong_waiter, timeout=10)
            except Exception:
                dead.append(ws)
        for ws in dead:
            LOG.info("Cliente inactivo, cerrando: %s", ws.remote_address)
            clients.pop(ws, None)
            try:
                await ws.close()
            except Exception:
                pass


def build_ssl_context(certfile: Optional[str], keyfile: Optional[str]) -> Optional[ssl.SSLContext]:
    if not certfile or not keyfile:
        return None
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(certfile, keyfile=keyfile)
    return ctx


async def main():
    parser = ArgumentParser(description="WS broadcast server (admin -> all)")
    parser.add_argument("--host", default=os.environ.get("HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8787")))
    parser.add_argument("--admin-token", default=os.environ.get("ADMIN_TOKEN", ""), help="Si se define, se exige en hello del admin.")
    parser.add_argument("--certfile", default=os.environ.get("CERTFILE", ""), help="Ruta a cert PEM (para wss).")
    parser.add_argument("--keyfile",  default=os.environ.get("KEYFILE",  ""), help="Ruta a key PEM (para wss).")
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.debug else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )

    ssl_ctx = build_ssl_context(args.certfile, args.keyfile)

    stop = asyncio.Future()

    def _stop(*_):
        if not stop.done():
            stop.set_result(True)

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _stop)
        except NotImplementedError:
            # Windows
            pass

    LOG.info("Arrancando servidor en %s://%s:%d", "wss" if ssl_ctx else "ws", args.host, args.port)
    async with websockets.serve(
        lambda ws: handle_client(ws, args.admin_token or None),
        host=args.host, port=args.port, ssl=ssl_ctx, ping_interval=None, max_size=2**20
    ):
        ping_task = asyncio.create_task(ping_loop())
        await stop
        ping_task.cancel()
        with contextlib.suppress(Exception):
            await ping_task


if __name__ == "__main__":
    import contextlib
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass

