import { promises as fs } from 'fs'
import { basename, extname } from 'path'
import { IMAGE_TYPES, MAX_IMAGE_BYTES, type Attachment } from '@shared/chat'

/** Đọc các file người dùng chọn để đính kèm: ảnh → base64, file khác chỉ trả đường dẫn. */
export async function readAttachments(paths: string[]): Promise<Attachment[]> {
  return Promise.all(
    paths.slice(0, 20).map(async (path): Promise<Attachment> => {
      const name = basename(path)
      const mediaType = IMAGE_TYPES[extname(path).slice(1).toLowerCase()]
      if (!mediaType) return { path, name }
      try {
        const st = await fs.stat(path)
        if (st.size > MAX_IMAGE_BYTES) return { path, name, error: `Ảnh lớn hơn 5 MB (${(st.size / 1048576).toFixed(1)} MB)` }
        const data = (await fs.readFile(path)).toString('base64')
        return { path, name, image: { name, mediaType, data } }
      } catch (err) {
        return { path, name, error: String((err as Error).message ?? err) }
      }
    })
  )
}
