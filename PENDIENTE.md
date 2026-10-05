# Estructuras pendientes de marcar

Generado automáticamente desde `src/content/placas/`. Estado actual:

**196 de 227 estructuras marcadas (86%).** Quedan 31.

Las marcas colocadas salen de los rótulos, flechas y números que las propias
láminas llevan dibujados, no de una identificación hecha a ojo.

---

## 1. Se pueden marcar: la lámina las señala con flecha (11)

La lámina ya las rotula con una flecha. Marcarlas es leer esa anotación, no
identificar nada. Pendiente sólo de dar el visto bueno.

| Diap. | Placa | Nº | Estructura |
|---|---|---|---|
| 20 | Alvéolos | 1 | Neumocitos tipo 1 |
| 20 | Alvéolos | 3 | Macrofago alveolar |
| 20 | Alvéolos | 4 | Miofibroblasto |
| 22 | Diente | 1 | Ameloblastos |
| 27 | Yeyuno | 1.1 | Enterocitos |
| 27 | Yeyuno | 1.2 | Células Caliciformes |
| 27 | Yeyuno | 1.3 | Borde en Cepillo |
| 27 | Yeyuno | 1.4 | Célula plasmática |
| 44 | Adenohipófisis | 1 | Células Acidófilos |
| 44 | Adenohipófisis | 2 | Células Basófilas |
| 44 | Adenohipófisis | 3 | Células Cromófobas |

---

## 2. No aparecen en la foto (16)

La estructura no entra en el encuadre o no se resuelve a esa ampliación.
**Hacen falta fotografías nuevas**: seis son serosas o adventicias (la capa más
externa del tubo digestivo, que se suele perder al encuadrar) y tres son cápsulas.

| Diap. | Placa | Nº | Estructura |
|---|---|---|---|
| 4 | Ganglio Linfático | 2 | Hilio |
| 4 | Ganglio Linfático | 4 | Corteza profunda (VEA) |
| 5 | Bazo | 3.1 | Zona del Manto |
| 7 | Piel gruesa | 9 | Estrato Basal |
| 12 | Placa ungeal | 7 | Estrato lúcido |
| 14 | Laringe | 7 | Ligamento vocal |
| 23 | Esófago | 5 | Adventicia |
| 24 | Estomago :fondo | 3 | Muscular externa |
| 24 | Estomago :fondo | 4 | Serosa |
| 26 | Duodeno | 4 | Adventicia/ serosa |
| 28 | Íleon | 5 | Serosa |
| 30 | Colon | 5 | Serosa (porciones intraperitoniales) Adventicia (porciones retroperitoneales) |
| 33 | Higado | 1 | Cápsula de Gilsson |
| 37 | Riñon | 1 | Capsula renal |
| 38 | Riñon :Corteza | 4 | Intersticio renal y capilares peritubulares |
| 42 | Uretra masculina | 4 | Tunica albuginea del cuero esponjoso |

---

## 3. Glándula Tiroides: error en la presentación (4)

La diapositiva 46 se titula «Glándula Tiroides» pero su descripción y sus cuatro
estructuras son de la **uretra** — un copia-pega sin corregir en Canva. No se
pueden marcar sobre una lámina de tiroides.

**Hay que corregirlo en Canva y reexportar el PDF**, o dictar las cuatro
estructuras correctas de la tiroides.

| Diap. | Placa | Nº | Estructura |
|---|---|---|---|
| 46 | Glándula Tiroides | 1 | Luz uretra (uretra esponjosa) |
| 46 | Glándula Tiroides | 2 | Mucosa |
| 46 | Glándula Tiroides | 3 | Cuero esponjoso del pene |
| 46 | Glándula Tiroides | 4 | Tunica albuginea del cuero esponjoso |

---

## Cómo marcarlas uno mismo

```bash
npm run dev
```

Y abrir **http://localhost:4321/Atlas-Histologia/admin/anotar**. Se elige la placa,
se hace clic sobre la imagen para poner el marcador y se arrastra para ajustarlo.
Al final, botón **Copiar JSON** y pegar en el campo `estructuras` del archivo de
la placa. Esa página sólo existe en desarrollo: nunca se publica.
