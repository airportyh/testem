/* globals expect, hello */
'use strict';

describe('hello', function() {

  it('says hello', function() {
    expect(hello()).toEqual('hello world');
  });

});
