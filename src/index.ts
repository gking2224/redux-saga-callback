import { call, fork, take, put, race, cancel, cancelled } from 'redux-saga/effects';
import { Task } from 'redux-saga';
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

type StringType = string;

const createPromiseHandlingSaga = <T> (name: string, action: ActionCreator<T> | StringType, promiseFactory: PromiseFactory<T>, repeating: boolean = true) => {
  return function*() {
    let payload: T | null = yield call(promiseFactory.getPromise);
    console.log(`promise yielded for callback (${name})`);
    try {
      while (payload) {
        if (typeof action === 'string') {
          yield put({
            type: action,
            payload,
          });
        } else {
          yield put(action(payload));
        }
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

export const createCallbackSaga = <P> (name: string, callbackConfigurer: CallbackConfigurer<any>, action: ActionCreator<P> | string, repeating: boolean = false, cancelAction?: string) => {

  const promiseFactory = createPromiseFactory(callbackConfigurer);
  const promiseHandlingSaga = createPromiseHandlingSaga(name, action, promiseFactory, repeating);

  return function*() {
    console.log(`forking callback saga (${name})`);
    const task: Task = yield fork(promiseHandlingSaga);
    if (cancelAction) {
      yield take(cancelAction);
      yield cancel(task);
    }
  }
}

export const createCallbackReactingSaga = <P> (
  name: string, callbackConfigurer: CallbackConfigurer<any>, action: ActionCreator<P> | string, reactingSaga: any, repeating: boolean = false, cancelAction?: string
) => {
  const promiseFactory = createPromiseFactory(callbackConfigurer);
  const promiseHandlingSaga = createPromiseHandlingSaga(name, action, promiseFactory, repeating);

  return function*() {
    try {
      console.log(`forking callback reacting saga (${name})`);
      const promiseTask: Task = yield fork(promiseHandlingSaga);

      let forkedTask: Task | undefined;
      let cancelled = false;

      while (!cancelled) {
        let promiseResult;
        if (cancelAction) {
          const { promise, cancellation } = yield race({
            promise: take(action),
            cancellation: take(cancelAction),
          });
          promiseResult = promise;
        }
        else {
          promiseResult = yield take(action);
        }
        if (promiseResult) {
          if (forkedTask && forkedTask.isRunning()) {
            yield cancel(forkedTask)
          }
          forkedTask = yield fork(reactingSaga, promiseResult.payload);
        } else {
          if (forkedTask && forkedTask.isRunning()) {
            yield cancel(forkedTask)
          }
          // if (!repeating) {
          yield cancel(promiseTask);
          cancelled = true;
          // }
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

export type CallbackConfigurer<T> = (successCallback: (result: T) => void) => void;

export type CreatePromiseFactory = <T>(callbackConfigurer: CallbackConfigurer<T>) => PromiseFactory<T>;
