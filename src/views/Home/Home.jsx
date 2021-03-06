import React, { useState, useEffect, useRef } from 'react';
import { drizzleConnect } from 'drizzle-react';
import Container from '../../components/Container';
import Box from '../../components/Box';
import { useTranslation } from 'react-i18next';
import UsersIcon from '@material-ui/icons/Group';
import CollectionsIcon from '@material-ui/icons/CollectionsBookmark';
import HowToVoteIcon from '@material-ui/icons/HowToVote';
import MessageIcon from '@material-ui/icons/Message';
import EmailIcon from '@material-ui/icons/Email';
import StarIcon from '@material-ui/icons/Star';
import TokenBalances from '../../components/TokenBalances';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faQrcode } from '@fortawesome/free-solid-svg-icons';
import SettingsIcon from '@material-ui/icons/SettingsOutlined';
import InfoIcon from '@material-ui/icons/InfoOutlined';
import BuildIcon from '@material-ui/icons/Build';
import SaveAltIcon from '@material-ui/icons/SaveAlt';
import AssignmentIcon from '@material-ui/icons/Assignment';
import QRModal from '../../components/QRModal';
import { buildIconLabelLink, buildIconLabelCallback, getEtherscanAddressURL } from '../../components/utils';
import Button from '@material-ui/core/Button';
import PropTypes from 'prop-types';
import Modal from '../../components/Modal';
import { contractCall, getContractData, readOnlyCall } from '../../components/Contractor';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { Link } from 'react-router-dom';
let faucetConfig = null;
try {
	faucetConfig = require('../../config/faucet-url.json');
} catch (err) {
	console.log('faucet-url.json not found');
}

const axios = require('axios');
const showDevButton = false;

function Home(props, context) {
	const { t } = useTranslation();
	const [iconIsHovered, setIconHovered] = useState(false);
	const [isQRModalOpen, setQRModalOpen] = useState(false);
	const [isBecomeVoterModalActive, setisBecomeVoterModalActive] = useState(false);
	const [isBecomeVoterTabActive, setisBecomeVoterTabActive] = useState(false);
	const style = { textDecoration: 'none' };
	const homeReady = useRef(false);
	const toggleQRModal = () => {
		setQRModalOpen(!isQRModalOpen);
	};
	const toggleBecomeVoterModalActive = () => {
		setisBecomeVoterModalActive(!isBecomeVoterModalActive);
	};
	const [isEligibleToBeAVoter, setIsEligibleToBeAVoter] = useState(false);

	const requestEther = () => {
		let recipient = props.defaultAccount;
		let networkID = window.ethereum.networkVersion;
		let encodedURL = faucetConfig.FAUCET_URL + '/faucet?recipient=' + recipient + '&networkID=' + networkID;
		console.log('Calling faucet server: ' + encodedURL);
		axios
			.get(encodedURL)
			.then(response => {
				console.log('Successfully called faucet server. Response: ' + response.data);
				alert(response.data);
			})
			.catch(error => {
				console.log('Error calling faucet server', error);
				alert('Failed to request Ether');
			})
			.finally(() => {});
	};

	const dev = () => {
		contractCall(
			context,
			props,
			props.store.getState().fin4Store.defaultAccount,
			'Fin4Main',
			'dev',
			3,
			'dev method call',
			{
				transactionCompleted: () => {
					console.log('--> transactionCompleted callback');
				},
				transactionFailed: () => {
					console.log('--> transactionFailed callback');
				},
				dryRunSucceeded: () => {
					console.log('--> dryRunSucceeded callback');
				},
				dryRunFailed: () => {
					console.log('--> dryRunFailed callback');
				}
			}
		);
	};

	const isEligible = () => {
		let res = readOnlyCall(
			context,
			props,
			props.store.getState().fin4Store.defaultAccount,
			'Fin4Verifying',
			'isEligibleToBeAVoter',
			[],
			'I want to be a voter',
			{},
			false,
			false
		);
		Promise.all(res).then(result => {
			console.log(result[0]);
			setIsEligibleToBeAVoter(result[0]);
		});
	};

	useEffect(() => {
		if (props.contracts.Fin4Voting && props.contracts.Fin4Voting.initialized && !homeReady.current) {
			homeReady.current = true;
			isEligible();
		}
	});

	const submitClaim = () => {
		contractCall(
			context,
			props,
			props.store.getState().fin4Store.defaultAccount,
			'Fin4Verifying',
			'becomeVoter',
			[],
			'I want to be a voter',
			{
				transactionCompleted: receipt => {
					console.log('You are a voter now!');
					let promises = [];
					promises.push(receipt.status);
					Promise.all(promises).then(() => setIsEligibleToBeAVoter(false));
				},
				transactionFailed: reason => {
					console.log("We couldn't enroll you on the list of voters because: " + reason);
				}
			}
		);
	};

	return (
		<Container>
			<TokenBalances />
			<Box title="On the blockchain">
				{' '}
				{/*t('about-you')*/}
				<p style={{ fontFamily: 'arial' }}>
					{t('your-public-address')}
					<br />
					<span style={{ fontSize: 'x-small' }}>
						{!window.web3 ? (
							t('info-not-yet-available')
						) : (
							<>
								{/* TODO make network-generic */}
								<a href={getEtherscanAddressURL(props.defaultAccount)} target="_blank">
									{props.defaultAccount}
								</a>
								<FontAwesomeIcon
									style={iconIsHovered ? styles.QRiconHover : styles.QRicon}
									icon={faQrcode}
									onClick={toggleQRModal}
									onMouseEnter={() => setIconHovered(true)}
									onMouseLeave={() => setIconHovered(false)}
								/>
							</>
						)}
					</span>
				</p>
				<QRModal isOpen={isQRModalOpen} handleClose={toggleQRModal} publicAddress={props.defaultAccount} />
				<div style={{ fontFamily: 'arial' }}>
					Your balance:{' '}
					{props.usersEthBalance === null
						? t('info-not-yet-available')
						: // TODO dynamic rounding / unit?
						  `${Math.round(props.usersEthBalance * 1000) / 1000} ETH`}
				</div>
				{window.web3 && props.usersEthBalance === 0 && (
					<div style={{ fontFamily: 'arial', color: 'red' }}>
						<small>Without Ether you are limited to read-only interactions.</small>
					</div>
				)}
				{(props.usersEthBalance === null || props.usersEthBalance === 0) && (
					<div style={{ fontFamily: 'arial', color: 'red' }}>
						<small>Are you connected to the correct network?</small>
					</div>
				)}
				{faucetConfig && faucetConfig.FAUCET_URL && (
					<>
						<br />
						{buildIconLabelCallback(requestEther, <SaveAltIcon />, t('request-ether'), false)}
					</>
				)}
			</Box>
			<Box title="Settings" width="250px">
				{/* TODO better title */}
				{buildIconLabelLink('/about', <InfoIcon />, 'About')}
				{buildIconLabelLink('/settings', <SettingsIcon />, 'System settings')}
				{buildIconLabelLink('/users/groups', <UsersIcon />, 'User groups')}
				{buildIconLabelLink('/collections', <CollectionsIcon />, 'Token collections')}
				{isEligibleToBeAVoter ? (
					<Link to={'#'} style={style}>
						<div
							style={{ display: 'flex', alignItems: 'center', paddingLeft: '15px', fontFamily: 'arial' }}
							onClick={() => {
								toggleBecomeVoterModalActive();
							}}>
							<HowToVoteIcon />
							&nbsp;&nbsp;Become a voter
						</div>
					</Link>
				) : null}
			</Box>
			<Modal
				isOpen={isBecomeVoterModalActive}
				handleClose={toggleBecomeVoterModalActive}
				title="Do you want to become a voter?"
				width="400px">
				<Container>
					<Button
						onClick={() => {
							submitClaim();
							toggleBecomeVoterModalActive();
						}}>
						{' '}
						Yes
					</Button>
					<Button
						onClick={() => {
							toggleBecomeVoterModalActive();
						}}>
						{' '}
						No
					</Button>
				</Container>
			</Modal>
			<Box title="Inbox" width="250px">
				{buildIconLabelLink('/messages', <EmailIcon />, 'Your messages')}
				{buildIconLabelLink('/user/message', <MessageIcon />, 'Message user', true, false)}
			</Box>
			<Box title="Token curation" width="250px">
				{buildIconLabelLink('/governance/listing', <StarIcon />, 'Listing')}
				{buildIconLabelLink('/governance/management', <AssignmentIcon />, 'Management')}
				{buildIconLabelLink('/governance/parameters', <BuildIcon />, 'Parameters', true, false)}
			</Box>
			{showDevButton && (
				<Box width="250px">
					<center>
						<Button variant="contained" color="primary" onClick={dev}>
							do the thing
						</Button>
					</center>
				</Box>
			)}
		</Container>
	);
}

const styles = {
	QRicon: {
		color: 'black',
		width: '20px',
		height: '20px',
		paddingLeft: '10px'
	},
	QRiconHover: {
		color: 'gray',
		width: '20px',
		height: '20px',
		paddingLeft: '10px'
	}
};

const mapStateToProps = state => {
	return {
		contracts: state.contracts,
		usersFin4TokenBalances: state.fin4Store.usersFin4TokenBalances,
		fin4Tokens: state.fin4Store.fin4Tokens,
		defaultAccount: state.fin4Store.defaultAccount,
		usersEthBalance: state.fin4Store.usersEthBalance
	};
};

Home.contextTypes = {
	drizzle: PropTypes.object
};

export default drizzleConnect(Home, mapStateToProps);
