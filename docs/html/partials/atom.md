### `Atom(value)`

`extends` [`Observable`](#-observable-)

`implements` [`isObservableRef`](#-isobservableref-value-)

Somewhat similar to
<a href="https://clojuredocs.org/clojure.core/atom" target="_blank">`clojure.core/atom`</a>.

Basic reactive pointer. Should be paired with
<a href="https://github.com/Mitranim/emerge" target="_blank">Emerge</a> for
efficient updates of nested values.

```js
const atom = new Atom(10)

atom.deref()  // 10

const sub = atom.subscribe(atom => {
  console.info(atom.deref())
})

atom.swap(value => value + 1)
// prints 11

atom.swap(value => value + 100)
// prints 111

sub.deinit()
```

#### `atom.swap(mod, ...args)`

where `mod: ƒ(currentValue, ...args)`

Sets the value of `atom` to the result of calling `mod` with the current value
and the optional args. Triggers subscribers if the value has changed at all.

```js
const atom = new Atom(10)

atom.deref()  // 10

// no additional args
atom.swap(value => value * 2)

atom.deref()  // 20

const add = (a, b, c) => a + b + c

// additional args
atom.swap(add, 1, 2)

atom.deref()  // add(20, 1, 2) = 23
```

---