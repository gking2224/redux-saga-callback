import { call, fork, take, put, race, cancel, cancelled } from 'redux-saga/effects';
import { ActionFunction1, Action } from 'redux-actions';

type ActionCreator<Payload> = ActionFunction1<Payload, Action<Payload>>;

const createPromiseFactory: CreatePromiseFactory = <T>(configureCallbacks: CallbackConfigurer<T>): PromiseFactory<T> => {

  let deferred: any;

  const callbackFunction = (frame: T) => {
    if (deferred) {
      deferred.resolve(frame);
      deferred = null;
    }
  }

  configureCallbacks(callbackFunction);

  return {
    getPromise: function() {
      if (!deferred) {
        deferred = {}
        deferred.promise = new Promise<T>((resolve) => {
          deferred.resolve = resolve;
        });
      }
      return deferred.promise;
    }
  }
}

const createPromiseHandlingSaga = <T> (name: string, action: ActionCreator<T>, promiseFactory: PromiseFactory<T>, repeating: boolean = true) => {
  return function*() {
    let payload: T | null = yield call(promiseFactory.getPromise);
    console.log(`promise yielded for callback (${name})`);
    try {
      while (payload) {
        yield put(action(payload));
        if (repeating) {
          payload = yield call(promiseFactory.getPromise)
          console.log(`promise yielded for callback (${name})`);
        }
        else {
          payload = null;
        }
      }
    } finally {
      if (yield cancelled()) {
        yield call(console.log, `promisified callback (${name}) cancelled`);
      } else {
        yield call(console.log, `promisified callback (${name}) ended gracefully`);
      }
    }
  }
}

export const createCallbackSaga = <P> (name: string, cancelAction: string | null, callbackConfigurer: CallbackConfigurer<any>, action: ActionCreator<P>, repeating: boolean = true) => {

  const promiseFactory = createPromiseFactory(callbackConfigurer);
  const promiseHandlingSaga = createPromiseHandlingSaga(name, action, promiseFactory, repeating);

  return function*() {
    console.log(`forking callback saga (${name})`);
    yield fork(promiseHandlingSaga);
  }
}

export const createCallbackReactingSaga = <P> (
  name: string, cancelAction: string, callbackConfigurer: CallbackConfigurer<any>, action: ActionCreator<P>, reactingSaga: any, repeating: boolean = true
) => {
  const promiseFactory = createPromiseFactory(callbackConfigurer);
  const promiseHandlingSaga = createPromiseHandlingSaga(name, action, promiseFactory, repeating);

  return function*() {
    try {
      console.log(`forking callback reacting saga (${name})`);
      const promiseTask = yield fork(promiseHandlingSaga);

      let forkedTask;
      let cancelled = false;

      while (!cancelled) {
        const { promise } = yield race({
          promise: take(action),
          cancellation: take(cancelAction),
        });
        if (promise) {
          if (forkedTask) {
            yield cancel(forkedTask)
          }
          forkedTask = yield fork(reactingSaga, promise.payload);
        } else {
          if (forkedTask) {
            yield cancel(forkedTask)
          }
          if (!repeating) {
            yield cancel(promiseTask);
            cancelled = true;
          }
        }
      }
    } finally {
      if (yield cancelled()) {
        console.log(`callback reaction saga (${name}) was cancelled`);
      }
    }
  }
}

export interface PromiseFactory<T> {
  getPromise: () => Promise<T>
}

export type CallbackConfigurer<S> = (successCallback: (r: S) => void) => void;

export type CreatePromiseFactory = <T>(callbackConfigurer: CallbackConfigurer<T>) => PromiseFactory<T>;
