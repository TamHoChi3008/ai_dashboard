/** Đổi chỗ hai phần tử theo id. Trả về mảng mới; giữ nguyên nếu không tìm thấy. */
export function swapById<T>(list: T[], a: string, b: string, id: (x: T) => string): T[] {
  const i = list.findIndex((x) => id(x) === a)
  const j = list.findIndex((x) => id(x) === b)
  if (i < 0 || j < 0 || i === j) return list
  const out = [...list]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

/** Chuyển phần tử `from` tới vị trí của `to` (các phần tử khác dồn lại). */
export function moveById<T>(list: T[], from: string, to: string, id: (x: T) => string): T[] {
  const i = list.findIndex((x) => id(x) === from)
  const j = list.findIndex((x) => id(x) === to)
  if (i < 0 || j < 0 || i === j) return list
  const out = [...list]
  const [item] = out.splice(i, 1)
  out.splice(j, 0, item)
  return out
}

/** Tab kế tiếp (dir = 1) hoặc trước đó (dir = -1), vòng quanh. */
export function cycleTab(order: string[], current: string, dir: 1 | -1): string {
  if (!order.length) return current
  const i = order.indexOf(current)
  if (i < 0) return order[0]
  return order[(i + dir + order.length) % order.length]
}

/** Tab được chọn sau khi đóng `closing`: tab bên phải, không có thì bên trái. */
export function tabAfterClose(order: string[], closing: string): string | undefined {
  const i = order.indexOf(closing)
  const rest = order.filter((x) => x !== closing)
  if (!rest.length) return undefined
  return rest[Math.min(Math.max(i, 0), rest.length - 1)]
}
