import { ErrorHandler, ReflectiveInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { WindowToken } from 'app/shared/window';
import { AppModule } from 'app/app.module';

import { ReportingErrorHandler } from './reporting-error-handler';

describe('ReportingErrorHandler service', () => {
  let handler: ReportingErrorHandler;
  let superHandler: jest.SpyInstance;
  let onerrorSpy: jest.SpyInstance;

  beforeEach(() => {
    onerrorSpy = jest.fn();
    superHandler = jest.spyOn(ErrorHandler.prototype, 'handleError').mockImplementation(jest.fn);

    const injector = ReflectiveInjector.resolveAndCreate([
      { provide: ErrorHandler, useClass: ReportingErrorHandler },
      { provide: WindowToken, useFactory: () => ({ onerror: onerrorSpy }) }
    ]);
    handler = injector.get(ErrorHandler);
  });

  it('should be registered on the AppModule', () => {
    handler = TestBed.configureTestingModule({ imports: [AppModule] }).get(ErrorHandler);
    expect(handler).toEqual(expect.any(ReportingErrorHandler));
  });

  describe('handleError', () => {
    it('should call the super class handleError', () => {
      const error = new Error();
      handler.handleError(error);
      expect(superHandler).toHaveBeenCalledWith(error);
    });

    it('should cope with the super handler throwing an error', () => {
      const error = new Error('initial error');
      superHandler.mockImplementation(() => {throw new Error('super handler error')});
      handler.handleError(error);

      expect(onerrorSpy).toHaveBeenCalledTimes(2);

      // Error from super handler is reported first
      expect(onerrorSpy.mock.calls[0][0]).toEqual('super handler error');
      expect(onerrorSpy.mock.calls[0][4]).toEqual(expect.any(Error));

      // Then error from initial exception
      expect(onerrorSpy.mock.calls[1][0]).toEqual('initial error');
      expect(onerrorSpy.mock.calls[1][4]).toEqual(error);
    });

    it('should send an error object to window.onerror', () => {
      const error = new Error('this is an error message');
      handler.handleError(error);
      expect(onerrorSpy).toHaveBeenCalledWith(error.message, undefined, undefined, undefined, error);
    });

    it('should send an error string to window.onerror', () => {
      const error = 'this is an error message';
      handler.handleError(error);
      expect(onerrorSpy).toHaveBeenCalledWith(error);
    });
  });
});
