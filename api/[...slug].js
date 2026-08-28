// Vercel Serverless Function 入口：/api/* 全部落到这里。
// 与本地 server/index.mjs 共用 server/core.mjs，行为完全一致。
// 注意：Vercel 的 api 目录要求 CommonJS 兼容的 ESM，Node 20 运行时支持顶层 await。
import { handleApi, CORS } from '../server/core.mjs'

export default async function handler(req, res) {
  const host = req.headers.host || 'localhost'
  const url = new URL(req.url || '/', `https://${host}`)
  try {
    await handleApi(req, res, url)
  } catch (e) {
    if (!res.writableEnded) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(JSON.stringify({ message: e.message || '服务器错误' }))
    }
  }
}
