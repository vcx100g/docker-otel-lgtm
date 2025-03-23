const { NodeSDK } = require('@opentelemetry/sdk-node')
const {
  getNodeAutoInstrumentations
} = require('@opentelemetry/auto-instrumentations-node')
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics')
const {
  OTLPTraceExporter
} = require('@opentelemetry/exporter-trace-otlp-proto')
const {
  OTLPMetricExporter
} = require('@opentelemetry/exporter-metrics-otlp-proto')

const { resourceFromAttributes } = require('@opentelemetry/resources');
const {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION
} = require('@opentelemetry/semantic-conventions');

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: 'rolldice', // Replace with your actual service name
  [ATTR_SERVICE_VERSION]: '1' // Replace with your actual service version
});

const metricReader = new PeriodicExportingMetricReader({
  exporter: new OTLPMetricExporter(),
  exportIntervalMillis: 60000 // Export metrics every 60 seconds
});


const sdk = new NodeSDK({
  resource, // Set the resource
  traceExporter: new OTLPTraceExporter(),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      resource
    })
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: (request) => {
          if (request.url === '/favicon.ico') {
            return true
          }
          return false
        }
      }
    })
  ]
})

sdk.start()
