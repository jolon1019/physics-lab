// 修改节点分析法 (MNA) 求解直流电路。
// 模型：每个元件端子都是独立节点；导线与元件都是"支路"。
//   - 导线：极小电阻 (1e-3 Ω)，自然得到各段导线电流，供电子流动画使用。
//   - 电阻类元件：其标称电阻。
//   - 电池：电压源支路。
// 优点：无需手写并查集/节点合并，任意自由搭建的拓扑都能直接求解。

function gauss(A, z) {
  const n = z.length
  const M = A.map((row, i) => [...row, z[i]])
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r
    if (Math.abs(M[piv][col]) < 1e-9) return null // 奇异（开环/孤岛）
    if (piv !== col) {
      const t = M[piv]
      M[piv] = M[col]
      M[col] = t
    }
    const d = M[col][col]
    for (let j = col; j <= n; j++) M[col][j] /= d
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = M[r][col]
      if (f !== 0) for (let j = col; j <= n; j++) M[r][j] -= f * M[col][j]
    }
  }
  return M.map((row) => row[n])
}

// branches: [{ id, a, b, R? , E? }]
//   a/b 为端子全键（如 "c1:p"）。R 与 E 二选一。
// 返回 { ok, error, nodeV, branches:[{id,a,b,I,Va,Vb}], isShort }
export function solveCircuit(branches) {
  const res = { ok: false, error: '', nodeV: {}, branches: [], isShort: false }
  if (!branches.length) {
    res.ok = true
    res.error = ''
    return res
  }
  const nodeSet = new Set()
  for (const br of branches) {
    nodeSet.add(br.a)
    nodeSet.add(br.b)
  }
  const order = [...nodeSet].sort()
  const groundId = order[0]
  const gp = order.indexOf(groundId)
  // 映射：节点 -> 矩阵行号（接地点被消去）
  const mIndex = (id) => {
    const p = order.indexOf(id)
    if (p === gp) return -1
    return p - (p > gp ? 1 : 0)
  }
  const nNodesM = order.length - 1
  const battBranches = branches.filter((b) => b.E != null)
  const nBatt = battBranches.length
  const N = nNodesM + nBatt
  if (N <= 0) {
    res.ok = true
    return res
  }
  if (nBatt === 0) {
    res.ok = true
    res.error = '未放入电池（电源）'
    return res
  }
  const A = Array.from({ length: N }, () => new Array(N).fill(0))
  const z = new Array(N).fill(0)
  for (const br of branches) {
    if (br.R == null) continue
    const g = 1 / br.R
    const ia = mIndex(br.a)
    const ib = mIndex(br.b)
    if (ia >= 0) {
      A[ia][ia] += g
      if (ib >= 0) A[ia][ib] -= g
    }
    if (ib >= 0) {
      A[ib][ib] += g
      if (ia >= 0) A[ib][ia] -= g
    }
  }
  battBranches.forEach((br, s) => {
    const row = nNodesM + s
    const ia = mIndex(br.a)
    const ib = mIndex(br.b)
    if (ia >= 0) {
      A[ia][row] += 1
      A[row][ia] += 1
    }
    if (ib >= 0) {
      A[ib][row] += -1
      A[row][ib] += -1
    }
    z[row] = br.E
  })
  const sol = gauss(A, z)
  if (!sol) {
    res.ok = false
    res.error = '电路未形成闭合回路'
    return res
  }
  const nodeV = {}
  order.forEach((id, p) => {
    nodeV[id] = p === gp ? 0 : sol[p - (p > gp ? 1 : 0)]
  })
  let maxI = 0
  const out = branches.map((br) => {
    const Va = nodeV[br.a]
    const Vb = nodeV[br.b]
    let I = 0
    if (br.R != null) I = (Va - Vb) / br.R
    else I = sol[nNodesM + battBranches.indexOf(br)] // 电压源电流（约定流出 a）
    if (Math.abs(I) > maxI) maxI = Math.abs(I)
    return { id: br.id, a: br.a, b: br.b, I, Va, Vb }
  })
  res.ok = true
  res.nodeV = nodeV
  res.branches = out
  if (maxI > 1e3) {
    res.isShort = true
    res.error = '短路！电流过大，请检查是否把电源两端直接用导线连通'
  }
  return res
}
