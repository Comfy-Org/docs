!function(t,e,c){if(t.syftc=c,!t.syft){t.syft={q:[],fi:[],fetchID:function(){var e=Array.prototype.slice.call(arguments);return new Promise(function(c,f){t.syft.fi.push({args:e,resolve:c,reject:f})})}},["identify","track","page","signup"].forEach(function(e){t.syft[e]=function(){var c=Array.prototype.slice.call(arguments);c.unshift(e),t.syft.q.push(c)}});var f=e.createElement("script");f.async=!0,f.setAttribute("src","https://cdn.sy-d.io/syftnext/syft.umd.js"),(e.body||e.head).appendChild(f)}}(window,document,{sourceId:"cmo1xgq4o000804jr5jlj5dtn",trackOutboundLinks:!1});

// Syft's built-in outbound link tracking prevents and replays clicks. That
// conflicts with Mintlify cards, which handle navigation on the card itself.
// Track the same event without changing the browser's navigation behavior.
document.addEventListener("click",function(event){
  var target=event.target instanceof Element?event.target.closest("a"):null;
  target&&target.host!==location.host&&target.href!==""&&target.href!=="#"&&window.syft.track("OutboundLink Clicked",{href:target.href});
},{capture:!0});
