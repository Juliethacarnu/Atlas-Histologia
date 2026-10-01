import type { DatosPlaca, EstructuraCliente } from './tipos';
import type { Visor } from './visor';
import * as estado from './estado';

/** Baraja una copia del arreglo (Fisher-Yates). */
function barajar<T>(lista: T[]): T[] {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j]!, copia[i]!];
  }
  return copia;
}

export function prepararQuiz(datos: DatosPlaca, visor: Visor) {
  const dialogo = document.getElementById('quiz') as HTMLDialogElement | null;
  const boton = document.getElementById('boton-quiz') as HTMLButtonElement | null;
  if (!dialogo || !boton) return;

  const conCoordenadas = datos.estructuras.filter((e) => e.puntos.length > 0);
  // Con menos de tres estructuras no hay distractores suficientes.
  if (conCoordenadas.length < 3) return;
  boton.disabled = false;

  const elOpciones = document.getElementById('quiz-opciones')!;
  const elRespuesta = document.getElementById('quiz-respuesta')!;
  const elNumero = document.getElementById('quiz-numero')!;
  const elPuntaje = document.getElementById('quiz-puntaje')!;
  const elTotal = document.getElementById('quiz-total')!;
  const botonSiguiente = document.getElementById('quiz-siguiente') as HTMLButtonElement;

  let cola: EstructuraCliente[] = [];
  let actual: EstructuraCliente | null = null;
  let aciertos = 0;
  let respondidas = 0;

  function pregunta() {
    if (cola.length === 0) cola = barajar(conCoordenadas);
    actual = cola.pop()!;
    elNumero.textContent = String(actual.numero);
    elRespuesta.textContent = '';
    botonSiguiente.disabled = true;

    // El visor se acerca a la estructura preguntada, sin revelar su nombre.
    estado.alternarRepaso(true);
    estado.activar(actual.id, 'quiz');
    visor.irA(actual.id, false);

    const distractores = barajar(conCoordenadas.filter((e) => e.id !== actual!.id)).slice(0, 3);
    const opciones = barajar([actual, ...distractores]);

    elOpciones.replaceChildren(
      ...opciones.map((op) => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = op.nombre;
        b.addEventListener('click', () => responder(op, b));
        li.appendChild(b);
        return li;
      }),
    );
  }

  function responder(elegida: EstructuraCliente, boton: HTMLButtonElement) {
    if (!actual || botonSiguiente.disabled === false) return;
    respondidas++;
    const correcto = elegida.id === actual.id;
    if (correcto) aciertos++;

    for (const b of elOpciones.querySelectorAll('button')) {
      b.disabled = true;
      if (b.textContent === actual.nombre) b.dataset.estado = 'bien';
    }
    if (!correcto) boton.dataset.estado = 'mal';

    elRespuesta.textContent = correcto ? `Correcto: ${actual.nombre}.` : `No: es ${actual.nombre}.`;
    elPuntaje.textContent = String(aciertos);
    elTotal.textContent = String(respondidas);
    botonSiguiente.disabled = false;
    estado.revelar(actual.id);
  }

  botonSiguiente.addEventListener('click', pregunta);

  boton.addEventListener('click', () => {
    aciertos = 0;
    respondidas = 0;
    elPuntaje.textContent = '0';
    elTotal.textContent = '0';
    cola = [];
    dialogo.showModal();
    pregunta();
  });

  dialogo.addEventListener('close', () => {
    estado.alternarRepaso(false);
  });
}
