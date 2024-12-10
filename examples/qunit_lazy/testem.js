module.exports = {
  framework: "qunit",
  test_page: "test.html",
  src_files: ["*.js"],
  launch_in_ci: ["Chrome"],
  socket_server_options: {
    // Uncomment the following line to increase the buffer
    // size and avoid the websocket disconnection.
    // maxHttpBufferSize: 1e6 + 100,
  },
};
