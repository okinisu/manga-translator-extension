const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const config=JSON.parse(fs.readFileSync('TFLITE-OPTIMIZATION.json'));
assert.equal(config.validated,true);assert.equal(crypto.createHash('sha256').update(fs.readFileSync('vendor/litert/detector_optimized.tflite')).digest('hex'),config.sha256);assert.equal(config.rowGatherRewrites,74);assert.equal(config.gpuRankLoweredTensors,67);assert.equal(config.gpuVersionLowering.length,2);assert.equal(config.explicitBroadcastInputs,87);assert.equal(config.composedTransposes,90);assert.equal(config.partialFP16.validated,true);assert.deepEqual(config.partialFP16.vendors,['amd']);assert.deepEqual(config.partialFP16.architectures,['rdna-3']);for(const key of ['backbone','head'])assert.equal(crypto.createHash('sha256').update(fs.readFileSync(config.partialFP16[key].file)).digest('hex'),config.partialFP16[key].sha256);assert.ok(config.partialFP16.gpuValidation.amdMaxEdgeErrorPx<3);assert.equal(config.gpuHardwareValidation.images,32);assert.equal(config.gpuHardwareValidation.sameClassAndCount,true);assert.ok(config.gpuHardwareValidation.maxBoxEdgeErrorPx<3);assert.ok(config.operatorsAfter<config.operatorsBefore);assert.equal(config.customOperators.length,0);
const worker=fs.readFileSync('detector-worker.js','utf8');assert.ok(!worker.includes('ort.'));assert.match(worker,/\[1,640,640,3\]/);
console.log('PASS: validated optimized TFLite model hash, 74 row gathers, standard operators and independent LiteRT runtime');

assert.equal(config.fullFP16.validated,true);assert.equal(config.fullFP16.optInOnly,true);assert.deepEqual(config.fullFP16.vendors,['amd','nvidia']);assert.deepEqual(config.fullFP16.architectures,['rdna-3','lovelace']);assert.ok(config.fullFP16.gpuValidation.maxEdgeErrorPx<=3);

assert.equal(config.fullFP16.halfConvolution.validated,true);assert.equal(config.fullFP16.halfConvolution.sameClassAndCount,true);assert.ok(config.fullFP16.halfConvolution.maxEdgeErrorPx<=3);

assert.equal(config.partialFP16.halfConvolution.validated,true);assert.equal(config.partialFP16.halfConvolution.sameClassAndCount,true);assert.ok(config.partialFP16.halfConvolution.maxEdgeErrorPx<1);

assert.equal(config.gpuInput.validated,true);assert.equal(config.gpuInput.requiresKnownOpaque,true);assert.equal(config.gpuInput.adapters.length,2);

assert.equal(config.fullFP16.nvidiaValidation.images,32);assert.equal(config.fullFP16.nvidiaValidation.sameClassAndCount,true);assert.ok(config.fullFP16.nvidiaValidation.maxEdgeErrorPx<=3);assert.equal(config.fullFP16.nvidiaValidation.autoEnabled,false);
