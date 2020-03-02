# redux-saga-callback

This library makes it easy to integrate traditional callback functions into a saga pattern.

## Usage
Supposing you have an object which fires a callback event after a short delay:
```
class EventEmitter {
  constructor() {
    setTimeout(() => {
      if (this.onEmit) {
        this.onEmit('hello');
      }
    }, 3000);
  }
}
const testObject = new EventEmitter();
```
You then create a 'callback configurer' function and then use that to create your saga:

```
const callbackConfigurer = (resolve) => testObject.onEmit = resolve;
const callbackSaga = createCallbackSaga('testCallback', callbackConfigurer, 'CALLBACK_RECEIVED');
```
This saga will then dispatch the action `CALLBACK_RECEIVED` when the callback is fired, with the payload as the callback argument.

Instead of an action type, you can also provide an `ActionCreator` object from `redux-actions`.

## Repeat triggering

For callbacks that are expected to be fired multiple times, you create the callback saga with `repeating = true`. You can cancel
the forked saga at will, or have it automatically cancel in response to another action:

```
class EventEmitter {
  constructor() {
    setInterval(() => {
      if (this.onEmit) {
        this.onEmit('hello');
      }
    }, 3000);
  }
}
const testObject = new EventEmitter();

const callbackConfigurer = (resolve) => testObject.onEmit = resolve;
const callbackSaga = createCallbackSaga('testCallback', callbackConfigurer, 'CALLBACK_RECEIVED', true, 'CANCEL_CALLBACK');

function* testSaga() {
  const task = yield fork(callbackSaga);
  yield delay(10000);
  // yield cancel(task);                    // these two lines
  yield put({type: 'CANCEL_CALLBACK'});     // are equivalent
}
```

## Saga triggering
Because a common pattern would be to fork another saga when the callback is fired, the following is also possible:
```
const callbackSaga = createCallbackReactingSaga('testCallback', callbackConfigurer, 'CALLBACK_RECEIVED', function*(payload) {
  yield call(console.log, 'callback fired', payload);
}, true, 'CANCEL_CALLBACK');

function* testSaga() {
  const task = yield fork(callbackSaga);
}
```

## Credits
Inspiration for this library was taken from the following issues/posts:
- https://github.com/redux-saga/redux-saga/issues/51
- https://stackoverflow.com/questions/34859932/can-i-use-redux-sagas-es6-generators-as-onmessage-listener-for-websockets-or-ev
