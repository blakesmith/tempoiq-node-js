'use strict';

var assert = require("assert");
var tempoiq = require("../lib/tempoiq");

var StubbedSession = require("../lib/session/stubbed_session");

// Tag test devices with a unique-ish attribute and key prefix so they're 
// unlikely to conflict with existing devices in the backend
var devicePrefix = "b90467087145fd06";

var _getClient = function() {
  if (process.env.INTEGRATION) {
    var creds = require('./integration-credentials.json')
    return tempoiq.Client(creds.key, creds.secret, creds.hostname, {port: creds.port, secure: creds.secure});
  } else {
    return tempoiq.Client("stubbed_key", "stubbed_secret", "stubbed_host", {secure: false, session: new StubbedSession})
  }
}

var _createDevice = function(callback) {
  var client = _getClient();
  var stubbed_body = {
    key: devicePrefix + "device1",
    name: "My Awesome Device",
    attributes: {building: "1234"},
    sensors: [
      {
        key: "sensor1",
        name: "My Sensor",
        attributes: {unit: "F"}
      },
      {
        key: "sensor2",
        name: "My Sensor2",
        attributes: {unit: "C"}
      }
    ]
  };
  stubbed_body.attributes[devicePrefix] = devicePrefix;

  client._session.stub("POST", "/v2/devices", 200, JSON.stringify(stubbed_body), {});

  var props = {
    name: "My Awesome Device",
    attributes: {building: "1234"},
    sensors: [
      new tempoiq.Sensor("sensor1", {
        name: "My Sensor",
        attributes: {unit: "F"}
      }),
      new tempoiq.Sensor("sensor2", {
        name: "My Sensor2",
        attributes: {unit: "C"}
      })
    ]
  };
  props.attributes[devicePrefix] = devicePrefix;
  client.createDevice(new tempoiq.Device(devicePrefix + "device", props),
  function(err, device) {
    if (err) throw err;
    callback(device);
  });
};

var _deleteDevices = function(callback) {
  var client = _getClient();
  var stubbed_body = {
    deleted: 1
  };
  client._session.stub("DELETE", "/v2/devices", 200, JSON.stringify(stubbed_body), {});

  var selection = {devices: {attributes: {}}};
  selection.devices.attributes[devicePrefix] = devicePrefix;

  client.deleteDevices(selection, function(err, summary) {
    if (err) throw err;
    callback(summary);
  });
};

describe("Client", function() {
  beforeEach(function(done) {
    _deleteDevices(function(summary) {
      done();
    });
  });

  afterEach(function(done) {
    _deleteDevices(function(summary) {
      done();
    });
  });

  describe("Initialization", function() {
    it("creates the client with the correct construction parameters", function() {
      var client = tempoiq.Client("key", "secret", "host", {
        port: 80
      });
      assert.equal("key", client.key);
      assert.equal("secret", client.secret);
      assert.equal("host", client.host);
      assert.equal(80, client.port);
    });
  })

  describe("Device provisioning", function() {
    it("creates a device", function(done) {
      var client = _getClient();
      var stubbedBody = {
        key: devicePrefix + "stubbed_key",
        name: "stubbed_name",
        attributes: {attr1: "value1"},
        sensors: []
      };
      stubbedBody.attributes[devicePrefix] = devicePrefix;
      client._session.stub("POST", "/v2/devices", 200, JSON.stringify(stubbedBody), {});

      var props = {
        name: "stubbed_name",
        attributes: {attr1: "value1"},
        sensors: []
      };
      props.attributes[devicePrefix] = devicePrefix;
      client.createDevice(new tempoiq.Device(devicePrefix + "stubbed_key", props),
      function(err, device) {
        if (err) throw err;
        assert.equal(devicePrefix + "stubbed_key", device.key);
        assert.equal("stubbed_name", device.name);
        assert.equal("value1", device.attributes["attr1"]);
        assert.equal(0, device.sensors.length);
        done();
      });
    });

    it("deletes a device by key", function(done) {
      var client = _getClient();
      _createDevice(function(device) {
        client._session.stub("DELETE", "/v2/devices/"+encodeURIComponent(device.key), 200);

        client.deleteDevice(device.key, function(err, deleted) {
          assert(deleted);
          done();
        });
      });
    });

    it("deletes a device", function(done) {
      var client = _getClient();
      _createDevice(function(device) {
        var stubbedBody = {
          deleted: 1
        };
        client._session.stub("DELETE", "/v2/devices", 200, JSON.stringify(stubbedBody), {});
        client.deleteDevices({devices: {key: device.key}}, function(err, summary) {
          if (err) throw err;
          assert.equal(1, summary.deleted);
          done();
        });
      })
    });

    it("updates a device", function(done) {
      var client = _getClient();
      _createDevice(function(device) {
        var originalName = device.name;
        device.name = "Updated";
        assert.notEqual(originalName, device.name);

        client._session.stub("PUT", "/v2/devices/"+encodeURIComponent(device.key), 200, JSON.stringify(device), {});
        client.updateDevice(device, function(err, updatedDevice) {
          if (err) throw err;
          assert.equal(device.name, updatedDevice.name);
          done();
        });
      });
    });

    it("gets a device", function(done) {
      var client = _getClient();
      _createDevice(function(device) {
        client._session.stub("GET", "/v2/devices/"+encodeURIComponent(device.key), 200, JSON.stringify(device), {});
        client.getDevice(device.key, function(err, found) {
          if (err) throw err;
          assert.equal(device.key, found.key);
          done();
        });
      })
    });

    it("returns no device when not found", function(done) {
      var client = _getClient();
      client._session.stub("GET", "/v2/devices/not_found", 404, "", {});
      client.getDevice("not_found", function(err, found) {
        if (err) throw err;
        assert.equal(null, found);
        done();
      });
    });

    it("lists the devices with streaming", function(done) {
      var client = _getClient();
      _createDevice(function(device) {
        var stubbedBody = {
          data: [device]
        };

        client._session.stub("GET", "/v2/devices", 200, JSON.stringify(stubbedBody), {});
        client.listDevices({devices: {key: device.key}}, {streamed: true}, function(cursor) {
          var dev = [];
          cursor.on('data', function(device) {
            dev.push(device);
          }).on('end', function() {
            assert.equal(1, dev.length);
            assert.equal(device.key, dev[0].key);
            done();
          }).on('error', function(e) {
            throw e;
          });
        });
      });
    });

    it("lists the devices without streaming", function(done) {
      var client = _getClient();
      _createDevice(function(device) {
        var stubbedBody = {
          data: [device]
        };

        client._session.stub("GET", "/v2/devices", 200, JSON.stringify(stubbedBody), {});
        client.listDevices({devices: {key: device.key}}, function(err, devices) {
          if (err) throw err;
          assert.equal(1, devices.length);
          assert.equal(device.key, devices[0].key);
          done();
        });
      });
    });
  });

  describe("Device writing", function() {
    it("bulk writes", function(done) {
      var client = _getClient();
      _createDevice(function(device) {
        var ts = new Date(2012,1,1);
        var deviceKey = device.key;
        var sensorKey = device.sensors[0].key;

        client._session.stub("POST", "/v2/write", 200, null, {});

        var write = new tempoiq.BulkWrite;
        write.push(deviceKey, sensorKey, new tempoiq.DataPoint(ts, 1.23));
        client.writeBulk(write, function(err, status) {
          assert(status.isSuccess());
          done();
        });
      });
    });

    it("handles partial write failure", function(done) {
      var client = _getClient();
      _createDevice(function(device) {

        var ts = new Date(2012,1,1);
        var deviceKey = device.key;
        var sensorKey = device.sensors[0].key;

        var stubbedBody = {};
        stubbedBody[devicePrefix + "device1"] = {
          success: false,
          message: "error writing to storage: FERR_NO_SENSOR: No sensor with key found in device."
        };
        client._session.stub("POST", "/v2/write", 207, JSON.stringify(stubbedBody));

        var write = new tempoiq.BulkWrite;
        write.push(deviceKey, sensorKey, new tempoiq.DataPoint(ts, 1.23));
        write.push(deviceKey, "not_here", new tempoiq.DataPoint(ts, 2.34));
        client.writeBulk(write, function(err, status) {
          if (err) throw err;
          assert(status.isPartialSuccess());
          assert(!status.isSuccess());
          assert(status.failures()[deviceKey] != undefined);
          done();
        });
      });
    });

    it("writes to a device", function(done) {
      var client = _getClient();
      _createDevice(function(device) {

        var ts = new Date(2012,1,1);
        var deviceKey = device.key;
        var sensorKey = device.sensors[0].key;

        client._session.stub("POST", "/v2/write", 200, null, {});
        var values = {};
        values[sensorKey] = 1.23;
        client.writeDevice(deviceKey, ts, values, function(err, written) {
          if (err) throw err;
          done();
        });
      });
    });
  });

  describe("Device reading", function() {
    it("reads with a pipeline", function(done) {
      var client = _getClient();
      _createDevice(function(device) {

        var ts = new Date(2012,1,1,1);
        var start = new Date(2012,1,1);
        var end = new Date(2012,1,2);

        var deviceKey = device.key;
        var sensorKey1 = device.sensors[0].key;
        var sensorKey2 = device.sensors[1].key;

        client._session.stub("POST", "/v2/write", 200);

        var d1 = {}
        d1[sensorKey1] = 4.0;
        d1[sensorKey2] = 2.0;

        // Welcome to callback city.
        client.writeDevice(deviceKey, new Date(2012, 1, 1, 1), d1, function(err, written) {
          if (err) throw err;
          client.writeDevice(deviceKey, new Date(2012, 1, 1, 2), d1, function(err, written) {
            if (err) throw err;

            var data = {}
            data[deviceKey] = {mean: 6.0};
            var stubbedRead = {
              data: [
                {
                  t: start.toISOString(),
                  data: data
                }
              ]
            };

            client._session.stub("GET", "/v2/read", 200, JSON.stringify(stubbedRead));
            var deviceSel = {}
            deviceSel["key"] = deviceKey;

            var pipeline = new tempoiq.Pipeline;
            pipeline.rollup("sum", "1day", start);
            pipeline.aggregate("mean");
            client.read({devices: deviceSel}, start, end, pipeline, {streamed: true}, function(res) {
              res.on("data", function(row) {
                assert.equal(start.toString(), row.ts.toString());
                assert.equal(6.0, row.value(deviceKey, "mean"));
              }).on("end", function() {
                done();
              }).on("error", function() {
                throw err;
              });
            });
          });
        });
      });
    });

    it("reads without a pipeline", function(done) {
      var client = _getClient();
      _createDevice(function(device) {

        var ts = new Date(2012,1,1,1);
        var start = new Date(2012,1,1);
        var end = new Date(2012,1,2);

        var deviceKey = device.key;
        var sensorKey1 = device.sensors[0].key;
        var sensorKey2 = device.sensors[1].key;

        client._session.stub("POST", "/v2/write", 200);

        var d1 = {}
        d1[sensorKey1] = 4.0;
        d1[sensorKey2] = 2.0;

        client.writeDevice(deviceKey, ts, d1, function(err, written) {
          if (err) throw err;

          var data = {}
          var sensors = {};
          sensors[sensorKey1] = 4.0;
          sensors[sensorKey2] = 2.0;
          data[deviceKey] = sensors;
          var stubbedRead = {
            data: [
              {
                t: ts.toISOString(),
                data: data
              }
            ]
          };

          client._session.stub("GET", "/v2/read", 200, JSON.stringify(stubbedRead));
          var deviceSel = {}
          deviceSel["key"] = deviceKey;

          client.read({devices: deviceSel}, start, end, null, {streamed: true}, function(res) {
            res.on("data", function(row) {
              assert.equal(ts.toString(), row.ts.toString());
              assert.equal(4.0, row.value(deviceKey, sensorKey1));
              assert.equal(2.0, row.value(deviceKey, sensorKey2));
            }).on("end", function() {
              done();
            });
          });
        });
      });
    });

    it("reads without streaming", function(done) {
      var client = _getClient();
      _createDevice(function(device) {

        var ts = new Date(2012,1,1,1);
        var ts2 = new Date(2012,1,1,2);
        var start = new Date(2012,1,1);
        var end = new Date(2012,1,2);

        var deviceKey = device.key;
        var sensorKey1 = device.sensors[0].key;
        var sensorKey2 = device.sensors[1].key;

        client._session.stub("POST", "/v2/write", 200);

        var d1 = {}
        d1[sensorKey1] = 4.0;
        d1[sensorKey2] = 2.0;

        var write = new tempoiq.BulkWrite;
        write.push(deviceKey, sensorKey1, new tempoiq.DataPoint(ts, 1.23));
        write.push(deviceKey, sensorKey1, new tempoiq.DataPoint(ts2, 1.23));
        client.writeBulk(write, function(err, status) {
          if (err) throw err;

          var data = {}
          var sensors = {};
          sensors[sensorKey1] = 1.23;
          data[deviceKey] = sensors;
          var stubbedRead = {
            data: [
              {
                t: ts.toISOString(),
                data: data
              },
              {
                t: ts2.toISOString(),
                data: data
              }
            ]
          };

          client._session.stub("GET", "/v2/read", 200, JSON.stringify(stubbedRead));
          var deviceSel = {}
          deviceSel["key"] = deviceKey;

          client.read({devices: deviceSel}, start, end, null, function(err, rows) {
            if (err) throw err;
            assert.equal(2, rows.length);
            assert.equal(ts.toString(), rows[0].ts.toString());
            done();
          });
        });
      });
    });
  });

  describe("Latest value", function() {
    it("gets latest value without streaming", function(done) {
      var client = _getClient();
      _createDevice(function(device) {

        var ts = new Date(2012,1,1,1);
        var start = new Date(2012,1,1);
        var end = new Date(2012,1,2);

        var deviceKey = device.key;
        var sensorKey1 = device.sensors[0].key;
        var sensorKey2 = device.sensors[1].key;
        var pipeline = new tempoiq.Pipeline;

        client._session.stub("POST", "/v2/write", 200);

        var d1 = {}
        d1[sensorKey1] = 4.0;
        d1[sensorKey2] = 2.0;

        client.writeDevice(deviceKey, ts, d1, function(err, written) {
          if (err) throw err;

          var data = {}
          var sensors = {};
          sensors[sensorKey1] = 4.0;
          sensors[sensorKey2] = 2.0;
          data[deviceKey] = sensors;
          var stubbedRead = {
            data: [
              {
                t: ts.toISOString(),
                data: data
              }
            ]
          };

          client._session.stub("GET", "/v2/single", 200, JSON.stringify(stubbedRead));
          var deviceSel = {}
          deviceSel["key"] = deviceKey;

          client.latest({devices: deviceSel}, pipeline, function(err, rows) {
            if (err) throw err;
            assert.equal(1, rows.length);
            assert.equal(ts.toString(), rows[0].ts.toString());
            done();
          });
        });
      });
    });

    it("gets latest value with streaming", function(done) {
      var client = _getClient();
      _createDevice(function(device) {

        var ts = new Date(2012,1,1,1);
        var start = new Date(2012,1,1);
        var end = new Date(2012,1,2);

        var deviceKey = device.key;
        var sensorKey1 = device.sensors[0].key;
        var sensorKey2 = device.sensors[1].key;
        var pipeline = new tempoiq.Pipeline;

        client._session.stub("POST", "/v2/write", 200);

        var d1 = {}
        d1[sensorKey1] = 4.0;
        d1[sensorKey2] = 2.0;

        client.writeDevice(deviceKey, ts, d1, function(err, written) {
          if (err) throw err;

          var data = {}
          var sensors = {};
          sensors[sensorKey1] = 4.0;
          sensors[sensorKey2] = 2.0;
          data[deviceKey] = sensors;
          var stubbedRead = {
            data: [
              {
                t: ts.toISOString(),
                data: data
              }
            ]
          };

          client._session.stub("GET", "/v2/single", 200, JSON.stringify(stubbedRead));
          var deviceSel = {}
          deviceSel["key"] = deviceKey;

          client.latest({devices: deviceSel}, pipeline, {streamed: true}, function(cursor) {
            var values = [];
            cursor.on('data', function(value) {
              values.push(value);
            }).on('end', function() {
              assert.equal(1, values.length);
              done();
            }).on('error', function(e) {
              throw e;
            });
          });
        });
      });
    });
  });

  describe("Deleting datapoints", function() {
    it("deletes datapoints from a device/sensor", function(done) {
      var client = _getClient();
      _createDevice(function(device) {

        var ts = new Date(2012,1,1,1);
        var start = new Date(2012,1,1);
        var end = new Date(2012,1,2);

        var deviceKey = device.key;
        var sensorKey1 = device.sensors[0].key;
        var sensorKey2 = device.sensors[1].key;
        var pipeline = new tempoiq.Pipeline;

        client._session.stub("POST", "/v2/write", 200);

        var d1 = {}
        d1[sensorKey1] = 4.0;
        d1[sensorKey2] = 2.0;

        client.writeDevice(deviceKey, ts, d1, function(err, written) {
          if (err) throw err;

          var data = {}
          var sensors = {};
          sensors[sensorKey1] = 4.0;
          sensors[sensorKey2] = 2.0;
          data[deviceKey] = sensors;
          var stubbedDelete = {
            deleted: 1
          };

          client._session.stub("DELETE", "/v2/devices/" + deviceKey + "/sensors/" + sensorKey1 + "/datapoints", 200, JSON.stringify(stubbedDelete));
          var deviceSel = {}
          deviceSel["key"] = deviceKey;

          var write = new tempoiq.BulkWrite;
          write.push(deviceKey, sensorKey1, new tempoiq.DataPoint(ts, 1.23));
          client.writeBulk(write, function(err, status) {
            assert(status.isSuccess());

            client.deleteDatapoints(deviceKey, sensorKey1, start, end, function(err, summary) {
              if (err) throw err;
              assert.equal(summary.deleted, 1);
              done();
            });
          });
        });
      });
    });
  });
});
