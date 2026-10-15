# dreamclock

Live: https://yoder.ing/dreamclock

A 7-segment clock written as plain if/else logic, compiled into a neural network by
[handwired](https://github.com/chenglou/handwired) (no training, every weight comes from the code),
then run once per pixel in a WebGL2 shader. Move the pointer to drag the weights away from the
hand-written ones and watch it melt. Click for new directions, Esc to snap back.

- `clock.ts`: the clock, as handwired builder code (128 neurons, 10 layers)
- `clock-build.ts`: compiles the network to GLSL and writes the pages
- `clock-check.ts`: prints the network's output as ASCII to check the digits
- `page.html` → `dist/index.html`: the standalone page that yoder.ing serves
- `page.html` → `dreamclock.html`: the same page in the format Claude artifacts use (no doctype)
- `page-annotated.html` → `dreamclock-annotated.html`: same piece with explanations
- `explainer.html`: "your if-statement is a neural network" slider demo
- `runtime/`: handwired's runtime, copied from the repo (MIT, see `runtime/LICENSE-handwired`)

```sh
bun clock-build.ts
python3 -m http.server 8765   # then open http://localhost:8765/dist/
```

The clock shows the viewer's local time (24-hour), so it's correct in any timezone.
