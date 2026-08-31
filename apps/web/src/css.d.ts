declare module "*.css" {
  const value: string
  export default value
}

declare module "*?raw" {
  const source: string
  export default source
}
