const os = require('os');
const fs = require('fs');
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { PeriodicExportingMetricReader, ConsoleMetricExporter } = require('@opentelemetry/sdk-metrics');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-proto');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-proto');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions');
const { ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-node');
const { performance } = require('perf_hooks');
const { PerformanceObserver, constants } = require('perf_hooks');
const { metrics } = require('@opentelemetry/api');

// SDK Initialization
const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: 'rolldice', // Replace with your actual service name
  [ATTR_SERVICE_VERSION]: '1' // Replace with your actual service version
});

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
            return true;
          }
          return false;
        }
      }
    })
  ]
});

sdk.start();

// Metric Definitions
const meter = metrics.getMeter('dice-lib');

// Process Uptime
const uptimeGauge = meter.createObservableGauge('process_uptime_seconds', {
  description: 'Time since the process started in seconds',
});
uptimeGauge.addCallback((observableResult) => {
  observableResult.observe(process.uptime());
});

// Process CPU Usage
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

// Process Memory Usage
const processMemoryGauge = meter.createObservableGauge('process_memory_usage_bytes', {
  description: 'Memory used by the Node.js process in bytes',
});
processMemoryGauge.addCallback((observableResult) => {
  observableResult.observe(process.memoryUsage().rss);
});

// HTTP Metrics
const requestCount = meter.createCounter('http_requests_total', {
  description: 'Total number of HTTP requests received',
});

const requestDuration = meter.createHistogram('http_request_duration_seconds', {
  description: 'Duration of HTTP requests in seconds',
  boundaries: [0.1, 0.3, 1.5, 5, 10],
});

const requestSize = meter.createHistogram('http_request_size_bytes', {
  description: 'Size of incoming HTTP requests in bytes',
  boundaries: [100, 500, 1000, 5000, 10000],
});

const responseSize = meter.createHistogram('http_response_size_bytes', {
  description: 'Size of outgoing HTTP responses in bytes',
  boundaries: [100, 500, 1000, 5000, 10000],
});

const inFlightRequests = meter.createUpDownCounter('http_in_flight_requests', {
  description: 'Number of in-flight HTTP requests being processed',
});

const requestErrors = meter.createCounter('http_requests_errors_total', {
  description: 'Total number of failed HTTP requests',
});

// Active Requests
let activeRequests = 0;
const requestConcurrency = meter.createObservableGauge('http_request_concurrency', {
  description: 'Number of concurrent HTTP requests being processed',
});
requestConcurrency.addCallback((observableResult) => {
  observableResult.observe(activeRequests);
});

// Garbage Collection Time
let totalGcTime = 0;
const gcTimeGauge = meter.createObservableGauge('process_gc_time_seconds', {
  description: 'Total time spent in garbage collection (seconds)',
});
const obs = new PerformanceObserver((list) => {
  const entry = list.getEntries()[0];
  totalGcTime += entry.duration / 1000; // Convert ms to seconds
});
obs.observe({ entryTypes: ['gc'], buffered: true });
gcTimeGauge.addCallback((observableResult) => {
  observableResult.observe(totalGcTime);
});

// Event Loop Lag
let maxLag = 0;
const eventLoopLagGauge = meter.createObservableGauge('process_event_loop_lag_seconds', {
  description: 'Maximum event loop lag in the last scrape interval (seconds)',
});
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
eventLoopLagGauge.addCallback((observableResult) => {
  observableResult.observe(maxLag);
  maxLag = 0; // Reset for the next scrape interval
});

// Open File Descriptors
const openFileDescriptors = meter.createObservableGauge('process_open_fds', {
  description: 'Number of open file descriptors',
});
openFileDescriptors.addCallback((observableResult) => {
  if (os.platform() === 'linux') { // Ensure it runs only on Linux
    try {
      const files = fs.readdirSync('/proc/self/fd'); // Synchronous call
      observableResult.observe(files.length);
    } catch (err) {
      observableResult.observe(0); // Fallback in case of error
    }
  } else {
    observableResult.observe(0); // Report 0 on non-Linux systems
  }
});

// Network Latency
const networkLatency = meter.createHistogram('http_request_network_latency_seconds', {
  description: 'Time taken before request starts processing (seconds)',
  boundaries: [0.001, 0.01, 0.1, 0.5, 1, 5],
});

// Exported Metrics
module.exports = {
  requestCount,
  requestDuration,
  requestSize,
  responseSize,
  inFlightRequests,
  requestErrors,
  uptimeGauge,
  processCpuUsageGauge,
  processMemoryGauge,
  activeRequests,
  gcTimeGauge,
  requestConcurrency,
  eventLoopLagGauge,
  openFileDescriptors,
  networkLatency,
};
