import React from 'react';
import { LoadingContainer } from 'drizzle-react-components';
import { ContractForm, ContractData } from 'drizzle-react-components';

const NewToken = () => (
	<>
		<h2>New Token</h2>

		<LoadingContainer>
			<ContractForm contract="Fin4BaseToken" method="createNewToken" />
		</LoadingContainer>

		<h2>Children of Fin4BaseToken</h2>

		<LoadingContainer>
			<ContractData contract="Fin4BaseToken" method="getChildren" />
		</LoadingContainer>
	</>
);

export default NewToken;
