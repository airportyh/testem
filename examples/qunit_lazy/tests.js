QUnit.test("demo failing socket", function (assert) {
  let tooLargePayload = "";
  while (tooLargePayload.length < 1e6) {
    tooLargePayload += "x";
  }
  console.log("trigger websocket disconnect");

  // Comment out the next line and CI will pass
  console.log(tooLargePayload);
  assert.equal(true, true, "this test should pass");
});
