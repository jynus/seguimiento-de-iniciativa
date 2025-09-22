## App de control de iniciativa en español

Tiene los siguientes 5 componentes:

* `corner-iframe-overlay`: Extensión compatible con Firefox y Chrome que inserta un iframe en Maps de DNDBeyond y muesta el cliente https://jynus.com/dnd/
* `html-admin`: Interfaz administrativa donde se puede ediar el estado de la iniciativa
* `html-client`: Interfaz de solo lectura del cliente donde se puede visualizar los cambios de estado de la iniciativa
* `websocket-server`: Servidor python que recive eventos del cliente admin y los rebrodcastea a todos los clientes normales
* `common`: Datos y hojas de estilo comunes y públicos a los clientes normals y admin (estado persistido, CSS, lista de condiciones válidas, etc.)

html-admin, html-client y common deberían desplegarse en un servidor web para su uso.
websocket-server debería instalarse fuera del servidor web, y por defecto escucha en el puerto 8447. Opcionalmente, se le puede pasar parámetros para usar certificados TLS (recomendado).
corner-iframe-overlay 
