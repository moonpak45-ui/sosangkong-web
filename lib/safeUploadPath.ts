// Supabase Storage 키는 한글/공백/특수문자가 섞인 원본 파일명을 그대로 쓰면
// "Invalid key" 에러가 날 수 있어, 확장자만 남기고 나머지는 새로 생성한다.
export function buildSafeUploadPath(folder: string, file: File): string {
  const extFromName = file.name.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1]
  const extFromType = file.type.split('/')[1]?.replace(/[^a-zA-Z0-9]/g, '')
  const ext = (extFromName || extFromType || 'bin').toLowerCase()
  const random = Math.random().toString(36).slice(2, 10)
  return `${folder}/${Date.now()}-${random}.${ext}`
}
