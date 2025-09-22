## App de control de iniciativa en español

Tiene los siguientes 3 componentes:

* `corner-iframe-overlay`: Extensión compatible con Firefox y Chrome que inserta un iframe en Maps de DNDBeyond y muesta el cliente https://jynus.com/dnd/
* `html`: Interfaz de cliente en solo lectura (index.html)y administrativa -editable for el narrador- (admin.html) donde se puede visualizar y editar el estado de la iniciativa. También incluye los elementos comunes a ambos: datos json y hojas de estilo.
* `websocket-server`: Servidor python que recive eventos del cliente admin y los rebrodcastea a todos los clientes normales


html deberían desplegarse en un servidor web para su uso.
websocket-server debería instalarse fuera del servidor web, y por defecto escucha en el puerto 8447. Opcionalmente, se le puede pasar parámetros para usar certificados TLS (recomendado).
corner-iframe-overlay debería comprimirse para su publicación (aunque puede probarse sin comprimir en el modo desarrollador de extensiones tanto en Firefox como en Chrome).
