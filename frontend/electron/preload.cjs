const { contextBridge } = require('electron')

const tokenArg = process.argv.find(value => value.startsWith('--acc-api-token='))
const portArg = process.argv.find(value => value.startsWith('--acc-api-port='))
contextBridge.exposeInMainWorld('accDesktop', {
  platform: process.platform,
  apiBaseUrl: `http://127.0.0.1:${portArg?.slice('--acc-api-port='.length) ?? '8765'}`,
  apiToken: tokenArg ? tokenArg.slice('--acc-api-token='.length) : '',
})
