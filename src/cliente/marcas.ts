/**
 * La marca de una estructura sobre la lámina.
 *
 * El problema que resuelve: un disco numerado centrado en el punto tapa justo
 * aquello que señala, y un número suelto no dice qué es. Aquí el punto es un
 * grano de tinta de 7 px y el nombre se aparta a un lado, unido por una línea
 * guía, como en la lámina de un atlas impreso.
 */
import type { EstructuraCliente, PuntoNormalizado } from './tipos';

export interface Marca {
  /** Lo que se superpone al visor; su centro es el punto exacto. */
  raiz: HTMLElement;
  /** Lo pulsable, que es a la vez el punto, la guía y el nombre. */
  boton: HTMLButtonElement;
}

export function crearMarca(estructura: EstructuraCliente, punto: PuntoNormalizado): Marca {
  const raiz = document.createElement('div');
  raiz.className = 'indicador';
  // El nombre se va hacia donde queda lámina: si el punto está en el tercio
  // derecho, hacia la izquierda; si no, hacia la derecha.
  raiz.dataset.lado = punto.x > 0.62 ? 'izquierda' : 'derecha';
  // Y si el punto está pegado al borde de arriba, el nombre no puede salir
  // hacia arriba: se avisa para que la propuesta lo cuelgue hacia abajo.
  raiz.dataset.alto = punto.y < 0.2 ? 'borde' : 'centro';

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'marcador';
  boton.dataset.estructura = estructura.id;
  boton.setAttribute('aria-pressed', 'false');

  const grano = document.createElement('span');
  grano.className = 'indicador__punto';
  grano.setAttribute('aria-hidden', 'true');

  const guia = document.createElement('span');
  guia.className = 'indicador__guia';
  guia.setAttribute('aria-hidden', 'true');

  const rotulo = document.createElement('span');
  rotulo.className = 'indicador__rotulo';
  rotulo.setAttribute('aria-hidden', 'true');

  const numero = document.createElement('span');
  numero.className = 'indicador__numero';
  numero.textContent = String(estructura.numero);

  const texto = document.createElement('span');
  texto.className = 'indicador__texto';
  texto.textContent = estructura.nombre;

  rotulo.append(numero, texto);
  boton.append(grano, guia, rotulo);
  raiz.append(boton);
  return { raiz, boton };
}
