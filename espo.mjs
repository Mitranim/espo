/* Primary API */

export function isDe(val) {return isComplex(val) && 'deinit' in val}
export function isObs(val) {return isDe(val) && isTrig(val) && 'sub' in val && 'unsub' in val}
export function isTrig(val) {return isComplex(val) && 'trig' in val}
export function isSub(val) {return isFun(val) || isTrig(val)}
export function isSubber(val) {return isFun(val) || (isComplex(val) && 'subTo' in val)}
export function isRunTrig(val) {return isComplex(val) && 'run' in val && isTrig(val)}

export function ph(ref) {return ref ? ref[keyPh] : undefined}
export function self(ref) {return ref ? ref[keySelf] || ref : undefined}

export function de(ref) {return new Proxy(ref, deinitPh)}
export function obs(ref) {return pro(ref, new (getPh(ref) || ObsPh)())}
export function comp(ref, fun) {return pro(ref, new (getPh(ref) || CompPh)(fun))}
export function lazyComp(ref, fun) {return pro(ref, new (getPh(ref) || LazyCompPh)(fun))}

export class Deinit {constructor() {return de(this)}}
export class Obs {constructor() {return obs(this)}}
export class Comp {constructor(fun) {return comp(this, fun)}}
export class LazyComp {constructor(fun) {return lazyComp(this, fun)}}

export function deinit(val) {if (isDe(val)) val.deinit()}

/* Secondary API (lower level, semi-undocumented) */

export const ctx = {subber: undefined}
export const keyPh = Symbol.for('ph')
export const keySelf = Symbol.for('self')

export class Rec extends Set {
  constructor() {
    super()
    this.new = new Set()
    this.act = false
  }

  onRun() {}

  run(...args) {
    if (this.act) throw Error(`unexpected overlapping rec.run`)

    const {subber} = ctx
    ctx.subber = this
    this.act = true

    this.new.clear()
    sch.pause()

    try {
      return this.onRun(...args)
    }
    finally {
      ctx.subber = subber
      this.forEach(recDelOld, this)
      try {sch.resume()}
      finally {this.act = false}
    }
  }

  trig() {}

  subTo(obs) {
    valid(obs, isObs)
    if (this.new.has(obs)) return
    this.new.add(obs)
    this.add(obs)
    obs.sub(this)
  }

  deinit() {
    this.forEach(recDel, this)
  }

  get [Symbol.toStringTag]() {return this.constructor.name}
}

export class Moebius extends Rec {
  constructor(ref) {
    super()
    this.ref = valid(ref, isRunTrig)
  }

  onRun(...args) {
    return this.ref.run(...args)
  }

  trig() {
    if (!this.act) this.ref.trig()
  }
}

export class Loop extends Rec {
  constructor(ref) {
    super()
    this.ref = valid(ref, isSub)
  }

  onRun() {
    subTrig(this.ref)
  }

  trig() {
    if (!this.act) this.run()
  }
}

export class DeinitPh {
  has(tar, key) {
    return key in tar || key === keyPh || key === keySelf || key === 'deinit'
  }

  get(tar, key) {
    if (key === keyPh) return this
    if (key === keySelf) return tar
    if (key === 'deinit') return dePhDeinit
    return tar[key]
  }

  set(tar, key, val) {
    set(tar, key, val)
    return true
  }

  deleteProperty(tar, key) {
    del(tar, key)
    return true
  }
}

export const deinitPh = new DeinitPh()

// WTB better name. Undocumented.
export class ObsBase extends Set {
  onInit() {}
  onDeinit() {}

  sub(val) {
    const {size} = this
    this.add(valid(val, isSub))
    if (!size) this.onInit()
  }

  unsub(val) {
    const {size} = this
    this.delete(val)
    if (size && !this.size) this.onDeinit()
  }

  trig() {
    if (sch.paused) {
      sch.add(this)
      return
    }
    this.forEach(subTrig)
  }

  deinit() {
    this.forEach(this.unsub, this)
  }

  get [Symbol.toStringTag]() {return this.constructor.name}
}

export class ObsPh extends ObsBase {
  constructor() {
    super()
    this.pro = undefined
  }

  has() {
    return DeinitPh.prototype.has.apply(this, arguments)
  }

  get(tar, key) {
    if (key === keyPh) return this
    if (key === keySelf) return tar
    if (key === 'deinit') return phDeinit
    if (!hidden(tar, key)) ctxSub(this)
    return tar[key]
  }

  set(tar, key, val) {
    if (set(tar, key, val)) this.trig()
    return true
  }

  deleteProperty(tar, key) {
    if (del(tar, key)) this.trig()
    return true
  }

  onInit() {
    if (this.pro && 'onInit' in this.pro) this.pro.onInit()
  }

  onDeinit() {
    if (this.pro && 'onDeinit' in this.pro) this.pro.onDeinit()
  }
}

export class LazyCompPh extends ObsPh {
  constructor(fun) {
    super()
    this.fun = valid(fun, isFun)
    this.out = true // means "outdated"
    this.cre = new CompRec(this)
  }

  get(tar, key) {
    if (key === keyPh) return this
    if (key === keySelf) return tar
    if (key === 'deinit') return phDeinit

    if (!hidden(tar, key)) {
      ctxSub(this)
      if (this.out) {
        this.out = false
        this.cre.run()
      }
    }

    return tar[key]
  }

  // Invoked by `CompRec`.
  run() {return this.fun.call(this.pro, this.pro)}
  onTrig() {this.out = true}
  onInit() {this.cre.init()}
  onDeinit() {this.cre.deinit()}
}

export class CompPh extends LazyCompPh {
  onTrig() {this.cre.run()}
}

export class CompRec extends Moebius {
  subTo(obs) {
    valid(obs, isObs)
    this.new.add(obs)
    if (this.ref.size) {
      this.add(obs)
      obs.sub(this)
    }
  }

  init() {
    this.new.forEach(compRecSub, this)
  }

  trig() {
    if (!this.act) this.ref.onTrig()
  }
}

export class Sched extends Set {
  constructor() {
    super()
    this.p = 0
  }

  get paused() {return this.p > 0}

  pause() {this.p++}

  resume() {
    if (!this.p) return
    this.p--
    if (!this.p) this.forEach(schFlush, this)
  }

  get [Symbol.toStringTag]() {return this.constructor.name}
}

export const sch = new Sched()

export function ctxSub(obs) {
  const {subber} = ctx
  if (isFun(subber)) subber(obs)
  else if (isSubber(subber)) subber.subTo(obs)
}

export function mut(tar, src) {
  valid(tar, isStruct)
  if (!src) return tar
  valid(src, isStruct)

  sch.pause()
  try {
    for (const key in src) tar[key] = src[key]
    return tar
  }
  finally {sch.resume()}
}

export function priv(ref, key, val) {
  Object.defineProperty(ref, valid(key, isKey), {
    value: val,
    writable: true,
    configurable: true,
    enumerable: false,
  })
}

export function privs(ref, vals) {
  valid(vals, isStruct)
  for (const key in vals) priv(ref, key, vals[key])
}

export function pub(ref, key, val) {
  Object.defineProperty(ref, valid(key, isKey), {
    value: val,
    writable: true,
    configurable: true,
    enumerable: true,
  })
}

export function pubs(ref, vals) {
  valid(vals, isStruct)
  for (const key in vals) pub(ref, key, vals[key])
}

export function bind(ref, ...funs) {
  funs.forEach(bindTo, valid(ref, isComplex))
}

function bindTo(fun) {
  valid(fun, isFun)
  if (!fun.name) throw Error(`can't bind anon function ${fun}`)
  priv(this, fun.name, fun.bind(this))
}

export function bindAll(ref) {
  bindAllFrom(ref, Object.getPrototypeOf(ref))
}

function bindAllFrom(ref, proto) {
  if (!proto || proto === Object.prototype) return
  const descs = Object.getOwnPropertyDescriptors(proto)

  for (const key in descs) {
    if (key === 'constructor' || hasOwn(ref, key)) continue
    const {value} = descs[key]
    if (isFun(value)) priv(ref, key, value.bind(ref))
  }

  bindAllFrom(ref, Object.getPrototypeOf(proto))
}

export function paused(fun, ...args) {
  sch.pause()
  try {return fun.apply(this, args)}
  finally {sch.resume()}
}

export function inert(fun, ...args) {
  const {subber} = ctx
  ctx.subber = undefined
  try {return fun.apply(this, args)}
  finally {ctx.subber = subber}
}

/* Internal utils */

function getPh(ref) {return ref.constructor && ref.constructor.ph}

function pro(ref, ph) {
  const pro = new Proxy(ref, ph)
  ph.pro = pro
  return pro
}

function set(ref, key, next) {
  const de = ownEnum(ref, key)
  const prev = ref[key]
  ref[key] = next
  if (Object.is(prev, next)) return false
  if (de) deinit(prev)
  return true
}

function del(ref, key) {
  if (!own(ref, key)) return false
  const de = ownEnum(ref, key)
  const val = ref[key]
  delete ref[key]
  if (de) deinit(val)
  return true
}

function dePhDeinit() {
  deinitAll(this)
  deinit(self(this))
}

function phDeinit() {
  ph(this).deinit()
  const ref = self(this)
  deinitAll(ref)
  deinit(ref)
}

export function deinitAll(ref) {
  valid(ref, isComplex)
  for (const key in ref) if (ownEnum(ref, key)) deinit(ref[key])
}

function subTrig(val) {
  if (isFun(val)) val()
  else val.trig()
}

function recDelOld(obs) {
  if (!this.new.has(obs)) recDel.call(this, obs)
}

function recDel(obs) {
  this.delete(obs)
  obs.unsub(this)
}

function compRecSub(obs) {
  this.add(obs)
  obs.sub(this)
}

function schFlush(obs) {
  this.delete(obs)
  obs.trig()
}

export function hasHidden(val, key) {
  valid(key, isKey)
  return isComplex(val) && hidden(val, key)
}

function hidden(val, key) {
  return !ownEnum(val, key) && key in val
}

export function hasOwn(val, key) {
  valid(key, isKey)
  return isComplex(val) && own(val, key)
}

function own(val, key) {
  return Object.prototype.hasOwnProperty.call(val, key)
}

export function hasOwnEnum(val, key) {
  valid(key, isKey)
  return isComplex(val) && ownEnum(val, key)
}

export function ownEnum(val, key) {
  return Object.prototype.propertyIsEnumerable.call(val, key)
}

function isFun(val) {return typeof val === 'function'}
function isComplex(val) {return isObj(val) || isFun(val) }
function isObj(val) {return val !== null && typeof val === 'object'}
function isStruct(val) {return isObj(val) && !Array.isArray(val) }
function isKey(val) {return isStr(val) || isSym(val) }
function isStr(val) {return typeof val === 'string'}
function isSym(val) {return typeof val === 'symbol'}

function valid(val, test) {
  if (!test(val)) throw Error(`expected ${show(val)} to satisfy test ${show(test)}`)
  return val
}

// Placeholder, might improve.
function show(val) {return String(val)}
