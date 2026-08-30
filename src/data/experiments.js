export const SUBJECTS = [
  { id: 'physics', label: '物理' },
  { id: 'math', label: '数学' }
]

export const GRADES = [
  {
    grade: 'grade8a',
    subject: 'physics',
    label: '八年级 上册',
    experiments: [
      { id: 'e-motion-desc', title: '运动的描述（参照物）', slug: 'motion-description', type: '探究', level: '基础' },
      { id: 'e-velocity', title: '探究匀速与变速运动', slug: 'uniform-motion', type: '探究', level: '核心' },
      { id: 'e-speed', title: '测量平均速度', slug: 'average-speed', type: '测量', level: '基础' },
      { id: 'e-sound', title: '探究声音的产生与传播', slug: 'sound-propagation', type: '探究', level: '基础' },
      { id: 'e-sound-tone', title: '探究声音的特性（音调·响度·音色）', slug: 'sound-properties', type: '探究', level: '核心' },
      { id: 'e-sound-noise', title: '回声测距与噪声的控制', slug: 'noise-echo', type: '探究', level: '基础' },
      { id: 'e-temp', title: '用温度计测量水的温度', slug: 'thermometer-temperature', type: '测量', level: '基础' },
      { id: 'e-melt', title: '探究固体熔化时的温度变化规律', slug: 'melting-temperature', type: '探究', level: '基础' },
      { id: 'e-boil', title: '探究水沸腾时温度变化的特点', slug: 'water-boiling', type: '探究', level: '基础' },
      { id: 'e-sublimate', title: '观察碘的升华和凝华', slug: 'iodine-sublimation', type: '观察', level: '基础' },
      { id: 'e-light', title: '探究光的反射定律', slug: 'light-reflection', type: '探究', level: '基础' },
      { id: 'e-mirror', title: '探究平面镜成像的特点', slug: 'plane-mirror', type: '探究', level: '核心' },
      { id: 'e-lens-camera', title: '探究凸透镜的成像规律', slug: 'lens-imaging', type: '探究', level: '核心' },
      { id: 'e-density', title: '测量固体和液体的密度', slug: 'density-measurement', type: '测量', level: '核心' }
    ]
  },
  {
    grade: 'grade8b',
    subject: 'physics',
    label: '八年级 下册',
    experiments: [
      { id: 'e-force', title: '探究重力的大小跟质量的关系', slug: 'spring-dynamometer', type: '探究', level: '基础' },
      { id: 'e-friction', title: '探究影响滑动摩擦力大小的因素', slug: 'sliding-friction', type: '探究', level: '核心' },
      { id: 'e-pressure', title: '探究液体内部压强的规律', slug: 'liquid-pressure', type: '探究', level: '核心' },
      { id: 'e-buoyancy', title: '探究浮力大小的影响因素', slug: 'buoyancy', type: '探究', level: '核心' },
      { id: 'e-lever', title: '探究杠杆的平衡条件', slug: 'lever-balance', type: '探究', level: '核心' },
      { id: 'e-pulley', title: '研究定滑轮和动滑轮的特点', slug: 'pulley-characteristics', type: '探究', level: '核心' },
      { id: 'e-pulley-sandbox', title: '滑轮组装沙盒与机械效率', slug: 'pulley-sandbox', type: '探究', level: '进阶' }
    ]
  },
  {
    grade: 'math7',
    subject: 'math',
    label: '七年级',
    experiments: [
      { id: 'e-num-line', title: '数轴与相反数·绝对值', slug: 'number-line-absolute', type: '探究', level: '基础' },
      { id: 'e-linear-eq', title: '一元一次方程（天平平衡）', slug: 'linear-equation-balance', type: '探究', level: '核心' },
      { id: 'e-coord-plane', title: '平面直角坐标系（描点挑战）', slug: 'coordinate-plane', type: '探究', level: '核心' },
      { id: 'e-parallel-lines', title: '相交线与平行线（三线八角）', slug: 'parallel-lines-angles', type: '探究', level: '基础' },
      { id: 'e-data-charts', title: '数据的收集与描述（三种统计图）', slug: 'data-charts', type: '探究', level: '基础' }
    ]
  },
  {
    grade: 'math8',
    subject: 'math',
    label: '八年级',
    experiments: [
      { id: 'e-tri-angles', title: '探究三角形内角和', slug: 'triangle-angle-sum', type: '探究', level: '基础' },
      { id: 'e-tri-sides', title: '探究三角形三边关系', slug: 'triangle-sides', type: '探究', level: '基础' },
      { id: 'e-aux-lines', title: '辅助线实验室（补·折·切·移）', slug: 'auxiliary-lines', type: '探究', level: '进阶' },
      { id: 'e-geometry-transform', title: '探究平移、旋转与轴对称', slug: 'geometry-transformations', type: '探究', level: '核心' },
      { id: 'e-congruent-tri', title: '探究全等三角形的判定', slug: 'congruent-triangles', type: '探究', level: '核心' },
      { id: 'e-pythagoras', title: '验证勾股定理（面积割补）', slug: 'pythagoras-theorem', type: '验证', level: '核心' },
      { id: 'e-mult-formula', title: '乘法公式的几何证明', slug: 'multiplication-formulas', type: '验证', level: '基础' },
      { id: 'e-linear-func', title: '探究一次函数 y=kx+b', slug: 'linear-function', type: '探究', level: '核心' }
    ]
  },
  {
    grade: 'math9',
    subject: 'math',
    label: '九年级',
    experiments: [
      { id: 'e-quadratic-func', title: '探究二次函数的图像与性质', slug: 'quadratic-function', type: '探究', level: '核心' },
      { id: 'e-quad-eq', title: '探究一元二次方程的解法', slug: 'quadratic-equation', type: '探究', level: '核心' },
      { id: 'e-circle', title: '探究圆的性质（垂径定理·圆周角）', slug: 'circle-properties', type: '探究', level: '核心' },
      { id: 'e-inverse-func', title: '探究反比例函数 k 的几何意义', slug: 'inverse-function', type: '探究', level: '核心' },
      { id: 'e-similar-tri', title: '探究相似三角形的性质', slug: 'similar-triangles', type: '探究', level: '核心' },
      { id: 'e-trig-func', title: '探究锐角三角函数', slug: 'trigonometric-ratios', type: '探究', level: '基础' },
      { id: 'e-probability', title: '用频率估计概率（抛硬币·掷骰子）', slug: 'probability-intro', type: '探究', level: '基础' },
      { id: 'e-block-views', title: '投影与三视图（方块塔）', slug: 'block-three-views', type: '探究', level: '进阶' }
    ]
  },
  {
    grade: 'grade9',
    subject: 'physics',
    label: '九年级 全册',
    experiments: [
      { id: 'e-circuit', title: '探究串并联电路的电流规律', slug: 'series-parallel-current', type: '探究', level: '核心' },
      { id: 'e-resistance', title: '探究影响电阻大小的因素', slug: 'resistance-factors', type: '探究', level: '基础' },
      { id: 'e-ohm', title: '探究电流与电压和电阻的关系', slug: 'ohms-law', type: '探究', level: '核心' },
      { id: 'e-power', title: '测量小灯泡的电功率', slug: 'lamp-power', type: '测量', level: '核心' },
      { id: 'e-magnet', title: '探究电磁铁磁性强弱的影响因素', slug: 'electromagnet-strength', type: '探究', level: '核心' },
      { id: 'e-coil-rotation', title: '通电线圈在磁场中的转动', slug: 'coil-rotation', type: '观察', level: '核心' }
    ]
  }
]

export function gradesBySubject(subject) {
  return GRADES.filter((g) => (g.subject || 'physics') === subject)
}

export function subjectOfGrade(gradeId) {
  return GRADES.find((g) => g.grade === gradeId)?.subject || 'physics'
}

export function findExperiment(id) {
  for (const g of GRADES) {
    const exp = g.experiments.find((e) => e.id === id)
    if (exp) return { exp, grade: g }
  }
  return null
}

export function findBySlug(slug) {
  for (const g of GRADES) {
    const exp = g.experiments.find((e) => e.slug === slug)
    if (exp) return { exp, grade: g }
  }
  return null
}

export function findExpId(slugOrId) {
  return findBySlug(slugOrId)?.exp.id || (findExperiment(slugOrId) ? slugOrId : null)
}