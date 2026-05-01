export function buildRumSnippet(endpoint: string): string {
  return `(function(){if(!('PerformanceObserver'in window))return;var e='${endpoint}';function s(n,v){navigator.sendBeacon&&navigator.sendBeacon(e,JSON.stringify({name:n,value:v,url:location.href,ua:navigator.userAgent,t:Date.now()}));}
try{new PerformanceObserver(function(l){l.getEntries().forEach(function(x){s('LCP',x.startTime);});}).observe({type:'largest-contentful-paint',buffered:true});}catch(_){}
try{new PerformanceObserver(function(l){l.getEntries().forEach(function(x){if(!x.hadRecentInput)s('CLS',x.value);});}).observe({type:'layout-shift',buffered:true});}catch(_){}
try{new PerformanceObserver(function(l){l.getEntries().forEach(function(x){s('INP',x.duration||x.processingEnd-x.startTime);});}).observe({type:'event',durationThreshold:40,buffered:true});}catch(_){}
var f=performance.getEntriesByName('first-contentful-paint')[0];if(f)s('FCP',f.startTime);var n=performance.getEntriesByType('navigation')[0];if(n)s('TTFB',n.responseStart-n.requestStart);}());`;
}
