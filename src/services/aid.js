import axios from 'axios';
import qs from 'query-string';
import { ethers } from 'ethers';

import { getUserToken } from '../utils/sessionManager';
import API from '../constants/api';
import CONTRACT from '../constants/contracts';
import { getContractByProvider, getContractInstance,generateMultiCallData } from '../blockchain/abi';
import { CURRENCY } from '../constants';

const access_token = getUserToken();

export async function createNft(payload, contracts, wallet) {
	return new Promise(async (resolve, reject) => {
		const { rahat_admin } = contracts;
		const contractInstance = await getContractInstance(rahat_admin, CONTRACT.RAHATADMIN, wallet);
		const { name, symbol, project, totalSupply } = payload;
		await contractInstance.createAndsetProjectBudget_ERC1155(name, symbol, project, totalSupply);
		contractInstance.on('ProjectERC1155BudgetUpdated', async (projectId, tokenId, projectCapital) => {
			const token = tokenId.toNumber();
			payload.tokenId = token;
			payload.metadata.currency = CURRENCY.NP_RUPEES;
			const res = await axios.post(`${API.NFT}`, payload, {
				headers: { access_token: access_token }
			});
			if (res.data) {
				await contractInstance.removeAllListeners();
				resolve(res.data);
			} else reject('Package creation failed!');
		});
	});
}

export async function mintNft({ payload, contracts, wallet }) {
	const { tokenId, projectCapital, projectId, packageId } = payload;
	const { rahat_admin } = contracts;
	const contractInstance = await getContractInstance(rahat_admin, CONTRACT.RAHATADMIN, wallet);
	const txn = await contractInstance.setProjectBudget_ERC1155(projectId, projectCapital, tokenId);
	if (txn) {
		const res = await axios.patch(
			`${API.NFT}/${packageId}/mint`,
			{ mintQty: projectCapital },
			{
				headers: { access_token: access_token }
			}
		);
		return res.data;
	}
}

export async function listNftPackages(projectId, query) {
	try {
		const res = await axios({
			url: `${API.NFT}/${projectId}/list?${qs.stringify(query)}`,
			method: 'get',
			headers: {
				access_token: access_token
			}
		});
		return res.data;
	} catch {}
}

export async function getPackageDetails(packageId) {
	try {
		const res = await axios({
			url: `${API.NFT}/${packageId}`,
			method: 'get',
			headers: {
				access_token: access_token
			}
		});
		return res.data;
	} catch {}
}

export async function addProjectBudget(wallet, projectId, supplyToken, contract_addr) {
	const contract = await getContractByProvider(contract_addr, CONTRACT.RAHATADMIN);
	const signerContract = contract.connect(wallet);
	const res = await signerContract.setProjectBudget_ERC20(projectId, supplyToken);
	let d = await res.wait();
	if (d) {
		await tokenAllocate(projectId, supplyToken, d.transactionHash);
		let project = await changeProjectStatus(projectId, 'active');
		return project;
	}
}

async function tokenAllocate(projectId, tokens, txHash) {
	try {
		return axios.patch(
			`${API.PROJECTS}/${projectId}/token`,
			{ amount: tokens, txhash: txHash },
			{
				headers: { access_token }
			}
		);
	} catch {}
}

export async function issueBeneficiaryToken(wallet, payload, contract_addr) {
	const contract = getContractByProvider(contract_addr, CONTRACT.RAHAT);
	const signerContract = contract.connect(wallet);
	const res = await signerContract.issueERC20ToBeneficiary(payload.projectId, payload.phone, payload.claimable);
	let d = await res.wait();
	return d;
}

export async function suspendBeneficiaryToken(wallet, payload, contract_addr) {
	const contract = await getContractByProvider(contract_addr, CONTRACT.RAHAT);
	const signerContract = contract.connect(wallet);
	const res = await signerContract.suspendBeneficiary(payload.phone,payload.projectId);
	let d = await res.wait();
	return d;
}

async function updateBenfIssuedPackage(benfId, issued_packages) {
	let res = await axios.patch(
		`${API.BENEFICARIES}/${benfId}/update-packages`,
		{ issued_packages },
		{
			headers: { access_token }
		}
	);
	return res.data;
}

export async function issueBeneficiaryPackage(wallet, payload, contract_addr) {
	const contract = await getContractByProvider(contract_addr, CONTRACT.RAHAT);
	const signerContract = contract.connect(wallet);
	const { benfId, projectId, phone, amounts, packageTokens } = payload;
	const phoneNumber = Number(phone);
	const res = await signerContract.issueERC1155ToBeneficiary(projectId, phoneNumber, amounts, packageTokens);
	let d = await res.wait();
	if (d) return updateBenfIssuedPackage(benfId, packageTokens);
}

export async function changeProjectStatus(aidId, status) {
	try {
		let res = await axios.patch(
			`${API.PROJECTS}/${aidId}/status`,
			{ status },
			{
				headers: { access_token }
			}
		);
		return res.data;
	} catch {}
}

export async function bulkTokenIssueToBeneficiary({
	wallet,
	projectId,
	phone_numbers,
	token_amounts,
	contract_address
}) {
	const callData = phone_numbers.map((phone,i) => {
		return generateMultiCallData(CONTRACT.RAHAT,"issueERC20ToBeneficiary",[projectId,phone,token_amounts[i]])
	})
	try {
		const contract = await getContractByProvider(contract_address, CONTRACT.RAHAT);
		const signerContract = contract.connect(wallet);
		return signerContract.multicall(callData);
	} catch (e) {
		throw new Error(e);
	}
	
	// try {
	// 	const contract = await getContractByProvider(contract_address, CONTRACT.RAHAT);
	// 	const signerContract = contract.connect(wallet);
	// 	return signerContract.issueBulkERC20(projectId, phone_numbers, token_amounts);
	// } catch (e) {
	// 	throw new Error(e);
	// }
}

export async function calculateTotalPackageBalance(payload) {
	let res = await axios.post(`${API.NFT}/total-package-balance`, payload, {
		headers: { access_token }
	});
	return res.data;
}

export async function getProjectPackageBalance(aidId, contract_address) {
	const contract = await getContractByProvider(contract_address, CONTRACT.RAHATADMIN);
	const data = await contract.getProjectERC1155Balances(aidId);
	if (!data) return null;
	if (data) {
		const tokenIds = data.tokenIds.map(t => t.toNumber());
		const tokenQtys = data.balances.map(b => b.toNumber());
		return calculateTotalPackageBalance({ tokenIds, tokenQtys });
	}
}

export async function getProjectsBalances(projectIds,contract_address) {
	try {
		const contract = await getContractByProvider(contract_address, CONTRACT.RAHATADMIN);
		const callData = projectIds.map((project) => {
		return generateMultiCallData(CONTRACT.RAHATADMIN,"getProjecERC20Balance",[project])
	})
		console.log({callData})
		const data = await contract.callStatic.multicall(callData)
		console.log({data});
		const projectBalances = data.map((el) => el.toNumber());
		console.log({projectBalances})
		return projectBalances;
	} catch (e) {
		console.log(e)
		return 0;
	}
}

// Get available balance
export async function loadAidBalance(aidId, contract_address) {
	try {
		const contract = await getContractByProvider(contract_address, CONTRACT.RAHATADMIN);
		const data = await contract.getProjecERC20Balance(aidId);
		return data.toNumber();
	} catch (e) {
		return 0;
	}
}

export async function getProjectCapital(aidId, contract_address) {
	try {
		const hashId = ethers.utils.solidityKeccak256(['string'], [aidId]);
		const contract = await getContractByProvider(contract_address, CONTRACT.RAHATADMIN);
		const data = await contract.callStatic.projectERC20Capital(hashId);
		return data.toNumber();
	} catch {
		return 0;
	}
}

export function vendorsByAid(aidId, query) {
	return new Promise((resolve, reject) => {
		axios
			.get(`${API.PROJECTS}/${aidId}/vendors?${qs.stringify(query)}`, {
				headers: { access_token: access_token }
			})
			.then(res => {
				if (res.statusText === 'OK') {
					resolve(res.data);
				}
				reject(res.data);
			})
			.catch(err => {
				reject(err);
			});
	});
}

export function beneficiaryByAid(aidId, query) {
	return new Promise((resolve, reject) => {
		axios
			.get(`${API.PROJECTS}/${aidId}/beneficiaries?${qs.stringify(query)}`, {
				headers: { access_token: access_token }
			})
			.then(res => {
				if (res.statusText === 'OK') {
					resolve(res.data);
				}
				reject(res.data);
			})
			.catch(err => {
				reject(err);
			});
	});
}

export function getAidDetails(aidId) {
	return new Promise((resolve, reject) => {
		axios
			.get(`${API.PROJECTS}/${aidId}`, {
				headers: { access_token: access_token }
			})
			.then(res => {
				if (res.statusText === 'OK') {
					resolve(res.data);
				}
				reject(res.data);
			})
			.catch(err => {
				reject(err);
			});
	});
}

export async function uploadBenfToProject(projectId, payload) {
	let res = await axios.post(`${API.PROJECTS}/${projectId}/upload-beneficiaries`, payload, {
		headers: { access_token }
	});
	return res.data;
}

export function addAid(payload) {
	return new Promise((resolve, reject) => {
		axios
			.post(`${API.PROJECTS}`, payload, {
				headers: { access_token: access_token }
			})
			.then(res => {
				if (res.statusText === 'OK') {
					resolve(res.data);
				}
				reject(res.data);
			})
			.catch(err => {
				reject(err);
			});
	});
}

export function updateAid(projectId, payload) {
	return new Promise((resolve, reject) => {
		axios
			.put(`${API.PROJECTS}/${projectId}`, payload, {
				headers: { access_token: access_token }
			})
			.then(res => {
				resolve(res.data);
			})
			.catch(err => {
				reject(err);
			});
	});
}

export async function listAid(params) {
	let { data } = await axios({
		url: API.PROJECTS,
		method: 'get',
		headers: {
			access_token: access_token
		},
		params
	});

	return data;
}

export async function addBeneficiary(aid, body) {
	const { data } = await axios({
		url: API.PROJECTS + `/${aid}/beneficiary`,
		method: 'post',
		headers: {
			access_token
		},
		data: body
	});

	return data;
}

export async function listFinancialInstitutions(params) {
	const res = await axios({
		url: API.INSTITUTIONS,
		method: 'get',
		headers: {
			access_token: access_token
		},
		params
	});
	return res.data;
}

export async function addVendor(aid, body) {
	const { data } = await axios({
		url: API.PROJECTS + `/${aid}/vendor`,
		method: 'post',
		headers: {
			access_token
		},
		data: body
	});

	return data;
}
