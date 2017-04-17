'use strict'

const {get, test, testAnd, isFunction, validate} = require('fpx')
const {deinit} = require('./deinit')
const {Subscription} = require('./subscription')
const {forceEach, pull, bindAll, flushBy} = require('./utils')

/**
 * Interfaces
 */

exports.isRef = isRef
function isRef (value) {
  return Boolean(value) && isFunction(value.deref)
}

exports.isObservable = isObservable
function isObservable (value) {
  return isObservable_(value)
}

const isObservable_ = test({subscribe: isFunction, unsubscribe: isFunction})

exports.isObservableRef = isObservableRef
function isObservableRef (value) {
  return isObservableRef_(value)
}

const isObservableRef_ = testAnd(isRef, {subscribe: isFunction, unsubscribe: isFunction})

/**
 * Utils
 */

exports.deref = deref
function deref (ref) {
  if (isRef(ref)) {
    const value = ref.deref()
    return value === ref ? value : deref(value)
  }
  return ref
}

exports.derefIn = derefIn
function derefIn (ref, path) {
  return deref(path.reduce(derefByKey, ref))
}

function derefByKey (cursor, key) {
  if (isRef(cursor)) {
    const value = cursor.deref()
    return (value === cursor ? get : derefByKey)(value, key)
  }
  return get(cursor, key)
}

/**
 * Classes
 */

class Observable {
  constructor () {
    if (this.constructor === Observable) bindAll(this)
    this.state = this.states.IDLE
    this.subscriptions = []
    this.triggering = false
  }

  // override in subclass
  onInit () {}

  // override in subclass
  onDeinit () {}

  subscribe (callback) {
    validate(isFunction, callback)

    if (this.state === this.states.IDLE) {
      this.onInit()
      this.state = this.states.ACTIVE
    }

    const sub = new Subscription(this, callback)
    this.subscriptions.push(sub)
    return sub
  }

  unsubscribe (sub) {
    pull(this.subscriptions, sub)
    if (this.state === this.states.ACTIVE && !this.subscriptions.length) {
      this.onDeinit()
      if (this.state === this.states.ACTIVE && !this.subscriptions.length) {
        this.state = this.states.IDLE
      }
    }
  }

  trigger () {
    if (this.state !== this.states.ACTIVE || this.triggering) return
    this.triggering = true
    try {
      forceEach(this.subscriptions, trigger, this)
    }
    finally {
      this.triggering = false
    }
  }

  deinit () {
    flushBy(this.subscriptions, deinit)
  }
}

exports.Observable = Observable

Observable.prototype.states = {
  IDLE: 'IDLE',
  ACTIVE: 'ACTIVE',
}

function trigger (subscription, ref) {
  subscription.trigger(ref)
}