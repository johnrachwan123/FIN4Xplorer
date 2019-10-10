import {
	ADD_MULTIPLE_FIN4_TOKENS,
	ADD_MULTIPLE_CLAIMS,
	UPDATE_MULTIPLE_BALANCES,
	ADD_MULTIPLE_PROOF_TYPES
} from '../middleware/actionTypes';
import Web3 from 'web3';

const BN = require('bignumber.js');
const web3 = new Web3(window.ethereum);

const getContractData = (contract, defaultAccount, method, ...methodArgs) => {
	if (methodArgs.length === 0) {
		return contract.methods[method]().call({
			from: defaultAccount
		});
	} else {
		return contract.methods[method](...methodArgs).call({
			from: defaultAccount
		});
	}
};

// --------------------- ENTRY POINT ---------------------

const addSatelliteContracts = (props, drizzle) => {
	let defaultAccount = props.store.getState().fin4Store.defaultAccount;
	getContractData(drizzle.contracts.Fin4Main, defaultAccount, 'getFin4MessagesAddress').then(Fin4MessagesAddress => {
		addContract(props, drizzle, 'Fin4Messages', Fin4MessagesAddress, []);
	});
	getContractData(drizzle.contracts.Fin4Main, defaultAccount, 'getFin4ClaimingAddress').then(Fin4ClaimingAddress => {
		addContract(props, drizzle, 'Fin4Claiming', Fin4ClaimingAddress, [
			'ClaimSubmitted',
			'ClaimApproved',
			'OneProofOnClaimApproval'
		]);
	});
};

const loadInitialDataIntoStore = (props, drizzle) => {
	let defaultAccount = props.store.getState().fin4Store.defaultAccount;

	getAndAddAllProofTypes(props, drizzle, defaultAccount, () => {
		getAllFin4Tokens(props, drizzle.contracts.Fin4Main, defaultAccount, () => {
			getMyNonzeroTokenBalances(props, drizzle.contracts.Fin4Main, defaultAccount);
			getAllCurrentUsersClaims(props, drizzle.contracts.Fin4Claiming, defaultAccount);
		});
	});
};

// -------------------------------------------------------

const addContract = (props, drizzle, name, address, events) => {
	const json = require('../build/contracts/' + name + '.json');
	let contractConfig = {
		contractName: name,
		web3Contract: new web3.eth.Contract(json.abi, address)
	};
	props.dispatch({ type: 'ADD_CONTRACT', drizzle, contractConfig, events, web3 });
};

const getAllFin4Tokens = (props, Fin4MainContract, defaultAccount, callback) => {
	getContractData(Fin4MainContract, defaultAccount, 'getAllFin4Tokens')
		.then(tokens => {
			return tokens.map(tokenAddr => {
				return getContractData(Fin4MainContract, defaultAccount, 'getTokenInfo', tokenAddr).then(
					({ 0: name, 1: symbol, 2: description, 3: unit }) => {
						return {
							address: tokenAddr,
							name: name,
							symbol: symbol,
							description: description,
							unit: unit
						};
					}
				);
			});
		})
		.then(promises => Promise.all(promises))
		.then(tokenArr => {
			props.dispatch({
				type: ADD_MULTIPLE_FIN4_TOKENS,
				tokenArr: tokenArr
			});
			callback();
		});
};

const getMyNonzeroTokenBalances = (props, Fin4MainContract, defaultAccount) => {
	getContractData(Fin4MainContract, defaultAccount, 'getMyNonzeroTokenBalances').then(
		({ 0: nonzeroBalanceTokens, 1: balancesBN }) => {
			if (nonzeroBalanceTokens.length === 0) {
				return;
			}
			props.dispatch({
				type: UPDATE_MULTIPLE_BALANCES,
				tokenAddresses: nonzeroBalanceTokens,
				balances: balancesBN.map(balanceBN => new BN(balanceBN).toNumber())
			});
		}
	);
};

const getAndAddAllProofTypes = (props, drizzle, defaultAccount, callback) => {
	let Fin4MainContract = drizzle.contracts.Fin4Main;
	getContractData(Fin4MainContract, defaultAccount, 'getProofTypes')
		.then(proofTypeAddresses => {
			return proofTypeAddresses.map(proofTypeAddress => {
				return getContractData(Fin4MainContract, defaultAccount, 'getProofTypeInfo', proofTypeAddress).then(
					({ 0: name, 1: description, 2: parameterForActionTypeCreatorToSetEncoded }) => {
						// add Contract objects to drizzle
						addContract(props, drizzle, name, proofTypeAddress, []);
						return {
							value: proofTypeAddress,
							label: name,
							description: description,
							paramsEncoded: parameterForActionTypeCreatorToSetEncoded,
							paramValues: {}
						};
					}
				);
			});
		})
		.then(data => Promise.all(data))
		.then(data => {
			props.dispatch({
				type: ADD_MULTIPLE_PROOF_TYPES,
				proofTypesArr: data
			});
			callback();
		});
};

const getAllCurrentUsersClaims = (props, Fin4ClaimingContract, defaultAccount) => {
	getContractData(Fin4ClaimingContract, defaultAccount, 'getActionsWhereUserHasClaims')
		.then(tokenAddresses => {
			return tokenAddresses.map(tokenAddr => {
				return getContractData(Fin4ClaimingContract, defaultAccount, 'getMyClaimIdsOnThisToken', tokenAddr).then(
					claimIds => {
						return claimIds.map(claimId => {
							return getContractData(
								Fin4ClaimingContract,
								defaultAccount,
								'getClaimOnThisToken',
								tokenAddr,
								claimId
							).then(
								({
									0: claimer,
									1: isApproved,
									2: quantityBN,
									3: dateBN,
									4: comment,
									5: requiredProofTypes,
									6: proofStatusesBool
								}) => {
									let proofStatusesObj = {};
									for (let i = 0; i < requiredProofTypes.length; i++) {
										proofStatusesObj[requiredProofTypes[i]] = proofStatusesBool[i];
									}
									return {
										id: tokenAddr + '_' + claimId, // pseudoId
										token: tokenAddr,
										claimId: claimId,
										claimer: claimer,
										isApproved: isApproved,
										quantity: new BN(quantityBN).toNumber(),
										date: new BN(dateBN).toNumber(),
										comment: comment,
										proofStatuses: proofStatusesObj
									};
								}
							);
						});
					}
				);
			});
		})
		.then(promises => Promise.all(promises))
		.then(data => data.flat())
		.then(promises => Promise.all(promises))
		.then(claimArr => {
			props.dispatch({
				type: ADD_MULTIPLE_CLAIMS,
				claimArr: claimArr
			});
		});
};

const findTokenBySymbol = (props, symb) => {
	let symbol = symb.toUpperCase();
	let keys = Object.keys(props.fin4Tokens);
	for (let i = 0; i < keys.length; i++) {
		let token = props.fin4Tokens[keys[i]];
		if (token.symbol === symbol) {
			return token;
		}
	}
	return null;
};

/*
// DEPRECATED
const getAllActionTypes = () => {
	return getContractData_deprecated(Fin4MainAddress, 'Fin4Main', 'getAllFin4Tokens')
		.then(tokens => {
			return tokens.map(address => {
				return getContractData_deprecated(address, 'Fin4Token', 'getInfo').then(({ 0: name, 1: symbol, 2: description }) => {
					return {
						value: address,
						label: `[${symbol}] ${name}`
					};
				});
			});
		})
		.then(data => Promise.all(data));
};

const getPollStatus = pollID => {
	// pollID is also called challengeID in Registry.sol
	return getContractData_deprecated('PLCRVotingAddress-DUMMY', 'PLCRVoting', 'pollMap', [pollID]).then(
		({ 0: commitEndDateBN, 1: revealEndDateBN, 2: voteQuorum, 3: votesFor, 4: votesAgainst }) => {
			let commitEndDate = new BN(commitEndDateBN).toNumber() * 1000;
			let revealEndDate = new BN(revealEndDateBN).toNumber() * 1000;
			let nowTimestamp = Date.now();

			if (commitEndDate - nowTimestamp > 0) {
				return {
					inPeriod: PollStatus.IN_COMMIT_PERIOD,
					dueDate: new Date(commitEndDate).toLocaleString('de-CH-1996') // choose locale automatically?
				};
			}

			if (revealEndDate - nowTimestamp > 0) {
				return {
					inPeriod: PollStatus.IN_REVEAL_PERIOD,
					dueDate: new Date(revealEndDate).toLocaleString('de-CH-1996')
				};
			}

			return {
				inPeriod: PollStatus.PAST_REVEAL_PERIOD,
				dueDate: ''
			};
		}
	);
};


const getTCRAddresses = props => {
	getContractData_deprecated(Fin4MainAddress, 'Fin4Main', 'getTCRaddresses').then(
		({ 0: REPToken, 1: GOVToken, 2: Registry, 3: PLCRVoting }) => {
			props.dispatch({
				type: ADD_ADDRESS,
				name: 'REPToken',
				address: REPToken
			});
			props.dispatch({
				type: ADD_ADDRESS,
				name: 'GOVToken',
				address: GOVToken
			});
			props.dispatch({
				type: ADD_ADDRESS,
				name: 'Registry',
				address: Registry
			});
			props.dispatch({
				type: ADD_ADDRESS,
				name: 'PLCRVoting',
				address: PLCRVoting
			});
		}
	);
};

const PollStatus = {
	IN_COMMIT_PERIOD: 'Commit Vote',
	IN_REVEAL_PERIOD: 'Reveal',
	PAST_REVEAL_PERIOD: '-'
};
*/

export { getContractData, addSatelliteContracts, findTokenBySymbol };
