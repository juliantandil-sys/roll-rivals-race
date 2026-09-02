# Dice Duel Dash

Prompt para Lovable

Quiero desarrollar un minijuego multijugador 1 vs 1 en tiempo real, jugable desde dos navegadores/dispositivos diferentes.

No quiero solamente una maqueta visual: el juego debe funcionar realmente entre dos personas conectadas a la misma partida, con sincronización en tiempo real.

Usá Supabase para manejar las partidas, jugadores, estado del juego y comunicación/realtime entre ambos jugadores.

Tengo una imagen adjunta que muestra aproximadamente cómo quiero que se vea la cancha. Usala como referencia visual para la disposición de la cuadrícula y las bolas.

Concepto del juego

Es un juego de dados para dos jugadores.

Cada jugador tiene 4 dados por turno.

Hay una cancha central formada por una cuadrícula de:

 4 columnas.

 7 filas.

 Una bola negra inicialmente ubicada en el centro de cada columna.

 Por lo tanto hay 4 bolas negras en total.

Cada columna tiene un color:

 Verde

 Rojo

 Azul

 Amarillo

Cada jugador ocupa un lado de la cancha:

 Jugador 1 → lado superior.

 Jugador 2 → lado inferior.

Al entrar a una partida, cada jugador debe elegir uno de esos lados.

Flujo de una partida

1. Crear o unirse a una partida

La página inicial debe permitir:

 Crear una nueva partida.

 Unirse a una partida existente mediante un código/link.

Cuando un jugador crea una partida, debe generarse un código único de partida.

Ejemplo:

ABCD12

El creador obtiene:

Compartí este código con tu rival: ABCD12

El segundo jugador introduce el código y se une.

Cuando hay dos jugadores:

 Uno queda como jugador superior.

 El otro como jugador inferior.

 La partida comienza.

No permitir que haya un tercer jugador en una partida.

Mostrar claramente:

Jugador 1 — Superior
Jugador 2 — Inferior

2. Selección del lado

Antes de comenzar, mostrar la cancha y permitir seleccionar:

SUPERIOR

o

INFERIOR

El lado seleccionado determina desde qué dirección el jugador podrá mover las bolas.

No permitir que los dos jugadores seleccionen el mismo lado.

Una vez que ambos eligieron su lado, comienza la partida.

3. Cancha

La cancha debe parecerse visualmente a la imagen adjunta.

Crear una cuadrícula de:

4 columnas × 7 filas

Las columnas tienen estos colores:

 Verde

 Rojo

 Azul

 Amarillo

Mostrar el nombre/color de cada columna en la parte superior.

La cuadrícula debe ocupar la mayor parte de la pantalla.

En el centro de cada columna hay una bola negra.

Estado inicial:

|     |     |     |     |
|     |     |     |     |
|     |  ⚫ |     |     |
|  ⚫ |     |     |     |
|     |     |  ⚫ |     |
|     |     |     |  ⚫ |
|     |     |     |     |

Pero conceptualmente las cuatro bolas deben comenzar alineadas aproximadamente en la zona central de la cancha.

Las bolas representan el objetivo que los jugadores intentarán empujar hacia el lado contrario.

4. Tirar los dados

Cada turno ambos jugadores reciben 4 dados.

Los dos jugadores tiran sus 4 dados simultáneamente.

IMPORTANTE:

Los dados son privados.

El jugador superior solamente puede ver sus propios dados.

El jugador inferior solamente puede ver sus propios dados.

Nunca mostrar al jugador los dados del rival antes de la fase de revelación.

Los valores de los dados deben generarse en el servidor/backend para evitar trampas.

Cada dado tiene un valor aleatorio de:

1 a 6

Ejemplo:

Jugador superior:

6 - 2 - 5 - 3

Jugador inferior:

4 - 6 - 1 - 5

5. Colocar los dados en las columnas

Después de tirar los dados, cada jugador debe asignar sus 4 dados a las 4 columnas.

Debe haber exactamente un dado por columna.

Los dados deben poder arrastrarse mediante drag & drop.

Por ejemplo, si el jugador tiene:

6 - 2 - 5 - 3

puede decidir:

 Verde → 5

 Rojo → 6

 Azul → 2

 Amarillo → 3

Una vez colocado un dado en una columna, no puede haber otro dado en esa misma columna.

El jugador puede reorganizar sus dados antes de confirmar.

Mostrar visualmente las cuatro columnas y las zonas donde puede colocar los dados.

Debe existir un botón:

"Estoy listo"

Hasta que el jugador presione "Estoy listo":

 Puede modificar la posición de sus dados.

 Sus dados siguen siendo privados.

 El rival no puede verlos.

Cuando presiona "Estoy listo":

Esperando al rival...

El jugador ya no puede modificar sus dados.

Cuando ambos jugadores hayan presionado "Estoy listo", comienza la fase de revelación.

6. Revelación de columnas

Las columnas se deben revelar una por una, no todas simultáneamente.

Orden:

 Verde

 Rojo

 Azul

 Amarillo

Cuando llega el momento de revelar una columna:

 Se muestran los dos dados correspondientes a esa columna.

 Ambos jugadores pueden verlos.

 Se compara el valor de ambos dados.

Por ejemplo:

VERDE

Jugador superior: 5
Jugador inferior: 3

→ Gana jugador superior

La animación debe hacer evidente la comparación.

7. Ganador de cada columna

El jugador que tenga el dado de mayor valor gana esa columna.

Ejemplo:

Jugador superior:

5

Jugador inferior:

2

Gana el jugador superior.

Si ocurre un empate:

4 vs 4

La columna queda en empate y la bola no se mueve.

Luego se pasa a la siguiente columna.

8. Mover la bola

Después de determinar quién ganó una columna, el ganador debe poder arrastrar la bola negra hacia el lado del rival.

La bola correspondiente a esa columna queda disponible para ser arrastrada.

El jugador ganador puede agarrar la bola y arrastrarla hacia el lado contrario de la cancha.

Visualmente:

Jugador superior
       ↓

┌─────────────┐
│             │
│      ⚫     │
│             │
│             │
│             │
│             │
└─────────────┘

       ↑
Jugador inferior

Si gana el jugador superior, debe poder arrastrar la bola hacia abajo.

Si gana el jugador inferior, debe poder arrastrar la bola hacia arriba.

La bola debe tener drag & drop real y sentirse fluida.

9. Condición de victoria

El objetivo es sacar una sola bola completamente fuera de la cancha por el lado del rival.

Por ejemplo:

Si el jugador superior gana una columna y arrastra la bola hacia abajo hasta sacarla completamente de la cancha:

Gana inmediatamente el jugador superior.

No hace falta sacar las cuatro bolas.

Con que una sola bola salga completamente de la cancha, termina la partida.

Mostrar una pantalla grande:

🏆 ¡GANASTE!

al ganador.

Y:

😔 PERDISTE

al otro jugador.

Mostrar también un botón:

Jugar otra vez

IMPORTANTE: comportamiento multijugador

Todo el estado del juego debe estar sincronizado entre los dos jugadores en tiempo real.

Si el jugador superior mueve un dado:

 El jugador inferior NO debe poder ver el valor del dado mientras la fase siga siendo secreta.

 Pero sí debería poder ver que el jugador está realizando acciones generales, como por ejemplo que todavía no está listo.

Cuando ambos están listos:

 El backend determina que comienza la revelación.

 Ambos clientes reciben exactamente el mismo estado.

 La columna que se está revelando debe ser la misma para ambos.

Cuando un jugador mueve una bola:

 El movimiento debe sincronizarse inmediatamente con el otro jugador.

No confiar en información enviada únicamente por el frontend.

Arquitectura / backend

Usar Supabase.

Crear una estructura de datos apropiada para:

games

 id

 game_code

 status

 created_at

 current_phase

 current_column

 winner

 created_by

players

 id

 game_id

 player_number

 side

 connected

 ready

game_rounds

 id

 game_id

 round_number

 player1_dice

 player2_dice

 player1_assignments

 player2_assignments

 ready_player1

 ready_player2

balls

 game_id

 column

 row

 status

 winner / ownership if needed

Podés modificar esta estructura si existe una arquitectura mejor.

Los dados privados deben estar protegidos mediante Supabase Row Level Security, de manera que un jugador no pueda consultar los dados secretos del otro mediante las herramientas del navegador.

Estados de la partida

Implementar una máquina de estados clara:

WAITING_FOR_PLAYER
        ↓
SELECTING_SIDES
        ↓
ROLLING_DICE
        ↓
PLACING_DICE
        ↓
WAITING_FOR_READY
        ↓
REVEALING_COLUMN
        ↓
MOVING_BALL
        ↓
NEXT_COLUMN
        ↓
ROLLING_DICE
        ↓
...
        ↓
GAME_OVER

No permitir que un jugador haga acciones correspondientes a una fase anterior.

Por ejemplo:

 No se pueden mover dados durante MOVING_BALL.

 No se puede mover una bola durante PLACING_DICE.

 No se pueden cambiar los dados después de "Estoy listo".

 No se puede modificar una columna que todavía no fue revelada.

 No se puede mover una bola si el jugador no ganó esa columna.

Interfaz

Quiero una interfaz moderna, limpia y muy visual.

La cancha debe ser el elemento principal.

En desktop:

┌──────────────────────────────────────────┐
│              PARTIDA ABCD12              │
│                                          │
│              JUGADOR SUPERIOR            │
│                                          │
│       🟢       🔴       🔵       🟡      │
│      ┌───┬───┬───┬───┐                  │
│      │   │   │   │   │                  │
│      │   │   │   │   │                  │
│      │ ⚫│   │   │   │                  │
│      │   │   │   │   │                  │
│      │   │   │ ⚫│   │                  │
│      │   │   │   │ ⚫│                  │
│      └───┴───┴───┴───┘                  │
│                                          │
│              JUGADOR INFERIOR            │
│                                          │
└──────────────────────────────────────────┘

No hace falta que sea exactamente ASCII, sino que quiero esa lógica visual.

Mostrar también:

 Código de partida.

 Estado de conexión del rival.

 Turno/fase actual.

 Dados del jugador.

 Botón "Estoy listo".

 Indicador de "Esperando al rival".

 Resultado de cada columna.

 Indicador visual de quién ganó cada columna.

Experiencia de usuario

Quiero que se sienta como un pequeño juego competitivo, no como una aplicación administrativa.

Agregar animaciones suaves:

 Dados rodando.

 Dados revelándose.

 Comparación de valores.

 Indicador de ganador.

 Bola siendo empujada.

 Bola saliendo de la cancha.

 Animación de victoria.

Las animaciones no deben afectar la lógica ni generar estados diferentes entre los jugadores.

Responsive

Debe funcionar correctamente en:

 PC

 Laptop

 Tablet

 Celular

En celular adaptar la cancha verticalmente sin romper la interacción de drag & drop.

Reglas importantes

 Hay exactamente 2 jugadores.

 Cada jugador tiene 4 dados por ronda.

 Cada dado pertenece a una sola columna.

 Debe haber exactamente un dado de cada jugador por columna.

 Los dados permanecen ocultos hasta que ambos jugadores estén listos.

 Las columnas se revelan una por una.

 El dado más alto gana la columna.

 En empate no se mueve la bola.

 El ganador de una columna puede arrastrar su bola hacia el lado rival.

 Si una bola sale completamente de la cancha, el jugador que la expulsó gana inmediatamente.

 El estado debe estar sincronizado en tiempo real.

 La información privada de cada jugador debe permanecer realmente privada.

 La lógica importante debe validarse en el backend.

 Un jugador no puede manipular desde el navegador el resultado de sus dados ni el resultado de una comparación.

MUY IMPORTANTE

Primero implementá una versión funcional completa, aunque visualmente sea simple.

Prioridad:

 Multiplayer real.

 Sincronización realtime.

 Privacidad de los dados.

 Lógica correcta del juego.

 Drag & drop.

 Condición de victoria.

 Después mejorar animaciones y estética.

No quiero botones que simplemente cambien visualmente el estado sin modificar el estado real de la partida.

Quiero poder abrir dos ventanas del navegador, entrar con dos jugadores diferentes y jugar una partida completa entre ambos.

Si es necesario crear/configurar tablas, políticas RLS, canales Realtime o funciones RPC en Supabase, hacelo.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://roll-rivals-race.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b3b50dda-5b9f-48ce-89bc-7bc06ecbfe00).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
