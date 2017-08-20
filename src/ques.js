import {call, slice, isFunction, validate} from 'fpx'
import {Subscription} from './subscription'
import {deinit} from './lifetime'
import {pull, flushBy, forceEach} from './utils'

export class Que {
  constructor (deque) {
    validate(isFunction, deque)
    this.state = this.states.IDLE
    this.pending = []
    this.deque = deque
  }

  push (value) {
    this.pending.push(value)
    if (this.state === this.states.IDLE) this.flush()
  }

  pull (value) {
    pull(this.pending, value)
  }

  dam () {
    if (this.state === this.states.IDLE) this.state = this.states.DAMMED
  }

  flush () {
    if (this.state === this.states.FLUSHING) return
    this.state = this.states.FLUSHING
    try {flushBy.call(this, this.pending, deque)}
    finally {this.state = this.states.IDLE}
  }

  isEmpty () {
    return !this.pending.length
  }

  isDammed () {
    return this.state === this.states.DAMMED
  }

  deinit () {
    this.pending.splice(0)
  }
}

Que.prototype.states = {
  IDLE: 'IDLE',
  DAMMED: 'DAMMED',
  FLUSHING: 'FLUSHING',
}

// Masks extra args from flushBy
function deque (value) {
  this.deque(value)  // eslint-disable-line no-invalid-this
}

export class TaskQue extends Que {
  constructor () {
    super(call)
  }

  push (fun) {
    validate(isFunction, fun)
    const task = fun.bind(this, ...slice(arguments, 1))
    super.push(task)
    return super.pull.bind(this, task)
  }
}

export class MessageQue extends TaskQue {
  constructor () {
    super()
    this.subscriptions = []
  }

  push () {
    super.push(triggerSubscriptions, arguments)
  }

  subscribe (callback) {
    const sub = new Subscription(this, callback)
    this.subscriptions.push(sub)
    return sub
  }

  unsubscribe (sub) {
    pull(this.subscriptions, sub)
  }

  deinit () {
    super.deinit()
    flushBy(this.subscriptions, deinit)
  }
}

function triggerSubscriptions (args) {
  forceEach(this.subscriptions.slice(), triggerSubscription, args)  // eslint-disable-line no-invalid-this
}

function triggerSubscription (subscription, args) {
  subscription.trigger(...args)
}