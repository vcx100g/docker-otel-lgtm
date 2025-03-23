const { NodeSDK } = require('@opentelemetry/sdk-node')
const {
  getNodeAutoInstrumentations
} = require('@opentelemetry/auto-instrumentations-node')
const { PeriodicExportingMetricReader, ConsoleMetricExporter } = require('@opentelemetry/sdk-metrics')
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
const { ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-node')

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: 'rolldice', // Replace with your actual service name
  [ATTR_SERVICE_VERSION]: '1' // Replace with your actual service version
});

// const metricReader = new PeriodicExportingMetricReader({
//   exporter: new OTLPMetricExporter(),
//   exportIntervalMillis: 60000 // Export metrics every 60 seconds
// });


// const sdk = new NodeSDK({
//   traceExporter: new ConsoleSpanExporter(),
//   metricReader: new PeriodicExportingMetricReader({
//     exporter: new ConsoleMetricExporter(),
//   }),
//   instrumentations: [getNodeAutoInstrumentations()],
// });

const sdk = new NodeSDK({
  resource, // Set the resource
  traceExporter: new OTLPTraceExporter(),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter()
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

// const meter = metrics.getMeter('system-metrics');
const {  metrics } = require('@opentelemetry/api')

const meter = metrics.getMeter('dice-lib')

// ✅ Track process uptime
const uptimeGauge = meter.createObservableGauge('process_uptime_seconds', {
  description: 'Time since the process started in seconds',
});
uptimeGauge.addCallback((observableResult) => {
  observableResult.observe(process.uptime());
});

// ✅ Track **only the current process's CPU usage** in percentage
const processCpuUsageGauge = meter.createObservableGauge('process_cpu_usage_percent', {
  description: 'CPU usage of the Node.js process as a percentage',
});
processCpuUsageGauge.addCallback((observableResult) => {
  const cpuUsage = process.cpuUsage();
  const totalTime = (cpuUsage.user + cpuUsage.system) / 1e6; // Convert to milliseconds
  const uptimeMs = process.uptime() * 1000;
  const cpuPercent = (totalTime / uptimeMs) * 100;
  observableResult.observe(cpuPercent);
});

// // ✅ Track **whole system CPU usage**
// const systemCpuUsageGauge = meter.createObservableGauge('system_cpu_usage_percent', {
//   description: 'Total system CPU usage as a percentage',
// });
// systemCpuUsageGauge.addCallback((observableResult) => {
//   const cpus = os.cpus();
//   let totalIdle = 0, totalTick = 0;

//   cpus.forEach((cpu) => {
//     for (const type in cpu.times) {
//       totalTick += cpu.times[type];
//     }
//     totalIdle += cpu.times.idle;
//   });

//   const idlePercentage = (totalIdle / totalTick) * 100;
//   const systemCpuUsage = 100 - idlePercentage;
//   observableResult.observe(systemCpuUsage);
// });

// // ✅ Track total system memory
// const totalMemoryGauge = meter.createObservableGauge('system_memory_total_bytes', {
//   description: 'Total system memory in bytes',
// });
// totalMemoryGauge.addCallback((observableResult) => {
//   observableResult.observe(os.totalmem());
// });

// // ✅ Track free system memory
// const freeMemoryGauge = meter.createObservableGauge('system_memory_free_bytes', {
//   description: 'Available free system memory in bytes',
// });
// freeMemoryGauge.addCallback((observableResult) => {
//   observableResult.observe(os.freemem());
// });

// ✅ Track **only the current Node.js process's memory usage**
const processMemoryGauge = meter.createObservableGauge('process_memory_usage_bytes', {
  description: 'Memory used by the Node.js process in bytes',
});
processMemoryGauge.addCallback((observableResult) => {
  observableResult.observe(process.memoryUsage().rss);
});

module.exports = {
  uptimeGauge,
  processCpuUsageGauge,
  systemCpuUsageGauge,
  totalMemoryGauge,
  freeMemoryGauge,
  processMemoryGauge,
};