require('./a.js');
require('./a/index.js');

var three = 2 + 1;

if (1 + 2 == three) {
  import('./b.js').then(function(b) {
    console.log(b.p);
  });
}
