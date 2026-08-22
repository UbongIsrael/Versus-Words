import {
  CELL_COUNT,
  GRID_SIZE,
  areAdjacent,
  extendPath,
  type Cell,
} from '@versus/sim'

export type GridView = {
  canvas: HTMLCanvasElement
  setPath: (path: number[]) => void
  destroy: () => void
}

type Handlers = {
  onPath: (path: number[]) => void
  onCommit: (path: number[]) => void
}

export function mountGrid(parent: HTMLElement, cells: Cell[], handlers: Handlers): GridView {
  const canvas = document.createElement('canvas')
  parent.append(canvas)
  const maybeCtx = canvas.getContext('2d')
  if (!maybeCtx) throw new Error('canvas')
  const ctx: CanvasRenderingContext2D = maybeCtx

  let path: number[] = []
  let tracing = false
  let dpr = 1
  let size = 0
  let gap = 0
  let tile = 0
  let pad = 0

  function layout() {
    const css = Math.min(parent.clientWidth, 400)
    dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2))
    canvas.style.width = `${css}px`
    canvas.style.height = `${css}px`
    canvas.width = Math.round(css * dpr)
    canvas.height = Math.round(css * dpr)
    size = css
    pad = css * 0.045
    gap = css * 0.03
    tile = (css - pad * 2 - gap * (GRID_SIZE - 1)) / GRID_SIZE
    draw()
  }

  function centerOf(index: number) {
    const r = Math.floor(index / GRID_SIZE)
    const c = index % GRID_SIZE
    return {
      x: pad + c * (tile + gap) + tile / 2,
      y: pad + r * (tile + gap) + tile / 2,
    }
  }

  function cellAt(x: number, y: number): number | null {
    for (let i = 0; i < CELL_COUNT; i++) {
      const { x: cx, y: cy } = centerOf(i)
      const hit = tile * 0.58
      if (Math.hypot(x - cx, y - cy) <= hit) return i
    }
    return null
  }

  function localPoint(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * size,
      y: ((e.clientY - rect.top) / rect.height) * size,
    }
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)
    ctx.fillStyle = '#e7dcc8'
    ctx.beginPath()
    roundRect(ctx, 0, 0, size, size, 24)
    ctx.fill()

    for (let i = 0; i < CELL_COUNT; i++) {
      const r = Math.floor(i / GRID_SIZE)
      const c = i % GRID_SIZE
      const x = pad + c * (tile + gap)
      const y = pad + r * (tile + gap)
      const on = path.includes(i)
      ctx.fillStyle = on ? '#1c1915' : '#fffaf1'
      ctx.beginPath()
      roundRect(ctx, x, y, tile, tile, 16)
      ctx.fill()
      ctx.fillStyle = on ? '#fff7ee' : '#1c1915'
      ctx.font = `620 ${tile * 0.42}px Fraunces, Georgia, serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(cells[i] ?? '', x + tile / 2, y + tile / 2 + 1)
    }

    if (path.length) {
      ctx.strokeStyle = '#c45c26'
      ctx.lineWidth = Math.max(5, tile * 0.1)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      path.forEach((index, n) => {
        const { x, y } = centerOf(index)
        if (n === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
    }
  }

  function start(e: PointerEvent) {
    const { x, y } = localPoint(e)
    const cell = cellAt(x, y)
    if (cell === null) return
    tracing = true
    path = [cell]
    canvas.setPointerCapture(e.pointerId)
    handlers.onPath(path)
    draw()
  }

  function move(e: PointerEvent) {
    if (!tracing) return
    const { x, y } = localPoint(e)
    const cell = cellAt(x, y)
    if (cell === null) return
    const last = path[path.length - 1]
    if (last === cell) return
    if (path.length >= 2 && path[path.length - 2] === cell) {
      path = extendPath(path, cell)
    } else if (last !== undefined && areAdjacent(last, cell) && !path.includes(cell)) {
      path = extendPath(path, cell)
    } else {
      return
    }
    handlers.onPath(path)
    draw()
  }

  function end() {
    if (!tracing) return
    tracing = false
    const committed = path
    path = []
    draw()
    handlers.onCommit(committed)
  }

  canvas.addEventListener('pointerdown', start)
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerup', end)
  canvas.addEventListener('pointercancel', end)
  const ro = new ResizeObserver(layout)
  ro.observe(parent)
  layout()

  return {
    canvas,
    setPath(next) {
      path = next
      draw()
    },
    destroy() {
      ro.disconnect()
      canvas.remove()
    },
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}
