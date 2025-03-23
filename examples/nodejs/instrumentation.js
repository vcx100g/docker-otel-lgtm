const os = require('os');
const fs = require('fs');
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

// ✅ Total number of HTTP requests
const requestCount = meter.createCounter('http_requests_total', {
  description: 'Total number of HTTP requests received',
});

// ✅ Histogram for request duration
const requestDuration = meter.createHistogram('http_request_duration_seconds', {
  description: 'Duration of HTTP requests in seconds',
  boundaries: [0.1, 0.3, 1.5, 5, 10], // Define custom bucket boundaries
});

// ✅ Histogram for request size in bytes
const requestSize = meter.createHistogram('http_request_size_bytes', {
  description: 'Size of incoming HTTP requests in bytes',
  boundaries: [100, 500, 1000, 5000, 10000], // Adjust based on expected request sizes
});

// ✅ Histogram for response size in bytes
const responseSize = meter.createHistogram('http_response_size_bytes', {
  description: 'Size of outgoing HTTP responses in bytes',
  boundaries: [100, 500, 1000, 5000, 10000],
});

// ✅ Gauge for in-flight requests (concurrent active requests)
const inFlightRequests = meter.createUpDownCounter('http_in_flight_requests', {
  description: 'Number of in-flight HTTP requests being processed',
});

// ✅ Counter for failed HTTP requests (errors)
const requestErrors = meter.createCounter('http_requests_errors_total', {
  description: 'Total number of failed HTTP requests',
});


// ✅ Create an ObservableGauge for HTTP request concurrency
let activeRequests = 0;
const requestConcurrency = meter.createObservableGauge('http_request_concurrency', {
  description: 'Number of concurrent HTTP requests being processed',
});

// ✅ Register a callback to observe the live active request count
requestConcurrency.addCallback((observableResult) => {
  observableResult.observe(activeRequests);
});

// ✅ Gauge for garbage collection time
const { performance } = require('perf_hooks');
const { PerformanceObserver, constants } = require('perf_hooks');

// ✅ Track Garbage Collection Time
const gcTimeGauge = meter.createObservableGauge('process_gc_time_seconds', {
  description: 'Total time spent in garbage collection (seconds)',
});

// ✅ Keep a counter for GC time
let totalGcTime = 0;

// ✅ Observe garbage collection events
const obs = new PerformanceObserver((list) => {
  const entry = list.getEntries()[0];
  totalGcTime += entry.duration / 1000; // Convert ms to seconds
});
obs.observe({ entryTypes: ['gc'], buffered: true });

// ✅ Report GC time via Observable Gauge
gcTimeGauge.addCallback((observableResult) => {
  observableResult.observe(totalGcTime);
});


// ✅ Gauge for event loop lag
const eventLoopLagGauge = meter.createObservableGauge('process_event_loop_lag_seconds', {
  description: 'Maximum event loop lag in the last scrape interval (seconds)',
});

let maxLag = 0;

// ✅ Continuously measure event loop lag
function measureEventLoopLag() {
  const start = performance.now();
  setTimeout(() => {
    const lag = (performance.now() - start - 1000) / 1000; // Expected delay is 1000ms
    if (lag > maxLag) {
      maxLag = lag; // Track the worst-case lag
    }
    measureEventLoopLag(); // Schedule the next measurement
  }, 1000); // Measure every 1 second
}
measureEventLoopLag();

// ✅ Report max event loop lag per scrape
eventLoopLagGauge.addCallback((observableResult) => {
  observableResult.observe(maxLag);
  maxLag = 0; // Reset for the next scrape interval
});



// ✅ Gauge for open file descriptors
const openFileDescriptors = meter.createObservableGauge('process_open_fds', {
  description: 'Number of open file descriptors',
});
openFileDescriptors.addCallback((observableResult) => {
  if (os.platform() === 'linux') { // ✅ Ensure it runs only on Linux
    try {
      const files = fs.readdirSync('/proc/self/fd'); // ✅ Synchronous call
      observableResult.observe(files.length);
    } catch (err) {
      observableResult.observe(0); // Fallback in case of error
    }
  } else {
    observableResult.observe(0); // Report 0 on non-Linux systems
  }
});

const networkLatency = meter.createHistogram('http_request_network_latency_seconds', {
  description: 'Time taken before request starts processing (seconds)',
  boundaries: [0.001, 0.01, 0.1, 0.5, 1, 5],
});


module.exports = {
  requestCount,
  requestDuration,
  requestSize,
  responseSize,
  inFlightRequests,
  requestErrors,
  uptimeGauge,
  processCpuUsageGauge,
  // systemCpuUsageGauge,
  // totalMemoryGauge,
  // freeMemoryGauge,
  processMemoryGauge,
  activeRequests,
  gcTimeGauge,
  requestConcurrency,
  eventLoopLagGauge,
  openFileDescriptors,
  networkLatency,
};