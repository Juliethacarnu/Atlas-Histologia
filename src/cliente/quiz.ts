import type { DatosPlaca, EstructuraCliente } from './tipos';
import type { Visor } from './visor';
import * as estado from './estado';
import { ICONO_BIEN, ICONO_MAL } from './iconos';

/** Baraja una copia del arreglo (Fisher-Yates). */
function barajar<T>(lista: T[]): T[] {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j]!, copia[i]!];
  }
  return copia;
}

/**
 * Mini quiz: una ronda con cada estructura marcada de la placa, una vez cada
 * una. El visor se acerca al punto preguntado y es el unico que queda a la
 * vista; el panel del quiz se pega abajo a un lado para no tapar la lamina.
 */
export function prepararQuiz(datos: DatosPlaca, visor: Visor) {
  const dialogo = document.getElementById('quiz') as HTMLDialogElement | null;
  const boton = document.getElementById('boton-quiz') as HTMLButtonElement | null;
  if (!dialogo || !boton) return;

  const conCoordenadas = datos.estructuras.filter((e) => e.puntos.length > 0);
  // Con menos de tres estructuras no hay distractores suficientes.
  if (conCoordenadas.length < 3) return;
  boton.disabled = false;

  const raiz = document.documentElement;
  const elOpciones = document.getElementById('quiz-opciones')!;
  const elRespuesta = document.getElementById('quiz-respuesta')!;
  const elProgreso = document.getElementById('quiz-progreso')!;
  const elTitulo = document.getElementById('quiz-titulo')!;
  const elInstruccion = document.getElementById('quiz-instruccion')!;
  const elBarra = document.getElementById('quiz-barra')!;
  const elPuntaje = document.getElementById('quiz-puntaje')!;
  const elTotal = document.getElementById('quiz-total')!;
  const botonSiguiente = document.getElementById('quiz-siguiente') as HTMLButtonElement;

  const total = conCoordenadas.length;
  let cola: EstructuraCliente[] = [];
  let actual: EstructuraCliente | null = null;
  let aciertos = 0;
  let respondidas = 0;

  function marcador() {
    elPuntaje.textContent = String(aciertos);
    elTotal.textContent = String(respondidas);
    elBarra.style.width = `${(respondidas / total) * 100}%`;
  }

  function empezar() {
    aciertos = 0;
    respondidas = 0;
    cola = barajar(conCoordenadas);
    marcador();
    pregunta();
  }

  function pregunta() {
    actual = cola.pop() ?? null;
    if (!actual) return final();
    raiz.dataset.quiz = 'pregunta';
    elProgreso.textContent = `Pregunta ${respondidas + 1} de ${total}`;
    elTitulo.textContent = '¿Qué estructura señala el punto?';
    elInstruccion.textContent =
      'Mira el punto que parpadea sobre la lámina (los demás se ocultan) y elige su nombre.';
    elRespuesta.textContent = '';
    delete elRespuesta.dataset.estado;
    botonSiguiente.disabled = true;
    botonSiguiente.textContent = cola.length ? 'Siguiente pregunta' : 'Ver resultado';

    // El visor se acerca a la estructura preguntada, sin revelar su nombre.
    estado.alternarRepaso(true);
    estado.activar(actual.id, 'quiz');
    visor.irA(actual.id, false);

    const distractores = barajar(conCoordenadas.filter((e) => e.id !== actual!.id)).slice(0, 3);
    const opciones = barajar([actual, ...distractores]);

    elOpciones.replaceChildren(
      ...opciones.map((op, i) => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.id = op.id;
        // El nombre va en su propio nodo: al responder, el icono de acierto
        // o de fallo se anade al lado sin pisarlo.
        const letra = document.createElement('b');
        letra.className = 'quiz__letra';
        letra.textContent = 'ABCD'[i]!;
        const texto = document.createElement('span');
        texto.textContent = op.nombre;
        b.append(letra, texto);
        b.addEventListener('click', () => responder(op, b));
        li.appendChild(b);
        return li;
      }),
    );
  }

  function responder(elegida: EstructuraCliente, boton: HTMLButtonElement) {
    if (!actual || raiz.dataset.quiz !== 'pregunta') return;
    raiz.dataset.quiz = 'respondida';
    respondidas++;
    const correcto = elegida.id === actual.id;
    if (correcto) aciertos++;

    for (const b of elOpciones.querySelectorAll<HTMLButtonElement>('button')) {
      b.disabled = true;
      if (b.dataset.id === actual.id) {
        b.dataset.estado = 'bien';
        b.insertAdjacentHTML('beforeend', ICONO_BIEN);
      }
    }
    if (!correcto) {
      boton.dataset.estado = 'mal';
      boton.insertAdjacentHTML('beforeend', ICONO_MAL);
    }

    elRespuesta.dataset.estado = correcto ? 'bien' : 'mal';
    elRespuesta.textContent = correcto
      ? `¡Correcto! Es ${actual.nombre}.`
      : `Incorrecto. La respuesta era: ${actual.nombre}.`;
    marcador();
    botonSiguiente.disabled = false;
    botonSiguiente.focus();
    estado.revelar(actual.id);
  }

  function final() {
    raiz.dataset.quiz = 'final';
    estado.activar(null, 'quiz');
    const nota = Math.round((aciertos / total) * 100);
    elProgreso.textContent = 'Quiz terminado';
    elTitulo.textContent = `Acertaste ${aciertos} de ${total}`;
    elInstruccion.textContent =
      nota === 100
        ? '¡Perfecto! Reconoces todas las estructuras de esta lámina.'
        : nota >= 60
          ? 'Muy bien. Repasa las que fallaste y vuelve a intentarlo.'
          : 'Sigue practicando: usa el modo repaso y vuelve a intentarlo.';
    elRespuesta.textContent = '';
    delete elRespuesta.dataset.estado;
    elOpciones.replaceChildren();
    botonSiguiente.textContent = 'Repetir quiz';
    botonSiguiente.disabled = false;
  }

  botonSiguiente.addEventListener('click', () => {
    if (raiz.dataset.quiz === 'final') empezar();
    else pregunta();
  });

  boton.addEventListener('click', () => {
    // No modal: la lamina queda a la vista y se puede seguir moviendo.
    if (!dialogo.open) dialogo.show();
    empezar();
  });

  dialogo.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') dialogo.close();
  });

  dialogo.addEventListener('close', () => {
    delete raiz.dataset.quiz;
    estado.activar(null, 'quiz');
    estado.alternarRepaso(false);
  });
}
