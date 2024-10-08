echo "Compiling circuit..."
nargo compile
if [ $? -ne 0 ]; then
  exit 1
fi

echo "Gate count:"
bb gates -b target/gitclaim.json | jq  '.functions[0].circuit_size'

echo "Copying circuit.json to app/assets/circuit.json"
cp target/gitclaim.json ../app/assets/circuit.json

echo "Generating vkey..."
bb write_vk_ultra_honk -b ./target/gitclaim.json -o ./target/vk

echo "Copying vkey to app/assets/circuit-vkey.json"
node -e "const fs = require('fs'); fs.writeFileSync('../app/assets/circuit-vkey.json', JSON.stringify(Array.from(Uint8Array.from(fs.readFileSync('./target/vk')))));"

echo "Done"
