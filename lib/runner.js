'use strict'

const {isFunction, validate} = require('fpx')
const {isRef, isObservable, deref, derefIn} = require('./observable')
const {PathQuery} = require('./query')
const {DeinitDict, deinit} = require('./deinit')
const {bindAll, flushBy} = require('./utils')

class Runner {
  constructor () {
    if (this.constructor === Runner) bindAll(this)
    this.contexts = new DeinitDict()  // Internal
    this.dd = new DeinitDict()        // External
  }

  deref (ref) {
    if (!isRef(ref)) throw Error(`Expected a deref-able object, got ${ref}`)
    if (!this.contexts.running) return deref(ref)
    if (isObservable(ref)) this.contexts.running.subscribeTo(ref)
    const value = ref.deref()
    return isRef(value) && value !== ref ? this.deref(value) : value
  }

  derefIn (ref, path) {
    if (!isRef(ref)) throw Error(`Expected a deref-able object, got ${ref}`)
    if (!this.contexts.running) return derefIn(ref, path)
    return this.deref(new PathQuery(ref, path))
  }

  run (fun, runOnTrigger) {
    validate(isFunction, fun)
    validate(isFunction, runOnTrigger)

    if (this.contexts.running) throw Error(`Unexpected overlapping .run()`)

    this.contexts.own({
      static: this.contexts.static,
      running: new RunnerContext(this, runOnTrigger),
    })

    try {
      return fun(this)
    }
    finally {
      this.contexts.own({static: this.contexts.running})
    }
  }

  deinit () {
    try {
      this.contexts.deinit()
    }
    finally {
      this.dd.deinit()
    }
  }

  static loop (fun) {
    validate(isFunction, fun)
    const runner = new Runner()
    function loop (runner) {
      runner.run(fun, loop)
    }
    loop(runner)
    return runner
  }
}

exports.Runner = Runner

class RunnerContext {
  constructor (runner, onTrigger) {
    this.state = this.states.PENDING
    this.runner = runner
    this.onTrigger = onTrigger
    this.trigger = this.trigger.bind(this)
    this.subscriptions = []
  }

  subscribeTo (observable) {
    if (this.state === this.states.PENDING) {
      this.subscriptions.push(observable.subscribe(this.trigger))
    }
  }

  trigger () {
    if (this.state === this.states.PENDING) {
      this.state = this.states.TRIGGERED
      this.onTrigger.call(null, this.runner)
    }
  }

  deinit () {
    this.state = this.states.DEAD
    flushBy(this.subscriptions, deinit)
  }
}

RunnerContext.prototype.states = {
  PENDING: 'PENDING',
  TRIGGERED: 'TRIGGERED',
  DEAD: 'DEAD',
}