import { ErrorHandler, ReflectiveInjector } from '@angular/core';
import { Logger } from './logger.service';

describe('logger service', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let logger: Logger;
  let errorHandler: ErrorHandler;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(jest.fn);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(jest.fn);
    const injector = ReflectiveInjector.resolveAndCreate([
      Logger,
      { provide: ErrorHandler, useClass: MockErrorHandler }
    ]);
    logger = injector.get(Logger);
    errorHandler = injector.get(ErrorHandler);
  });

  describe('log', () => {
    it('should delegate to console.log', () => {
      logger.log('param1', 'param2', 'param3');
      expect(logSpy).toHaveBeenCalledWith('param1', 'param2', 'param3');
    });
  });

  describe('warn', () => {
    it('should delegate to console.warn', () => {
      logger.warn('param1', 'param2', 'param3');
      expect(warnSpy).toHaveBeenCalledWith('param1', 'param2', 'param3');
    });
  });

  describe('error', () => {
    it('should delegate to ErrorHandler', () => {
      const err = new Error('some error message');
      logger.error(err);
      expect(errorHandler.handleError).toHaveBeenCalledWith(err);
    });
  });
});


class MockErrorHandler implements ErrorHandler {
  handleError = jest.fn();
}
