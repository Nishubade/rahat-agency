import React from 'react';
import indexRoutes from '../routes';
import { Router, Route, Switch } from 'react-router-dom';
import { ToastProvider } from 'react-toast-notifications';

import { History } from '../utils/History';
import { PrivateRoute } from '../routes/PrivateRoutes';
import { AppContextProvider } from '../contexts/AppSettingsContext';
import { UserContextProvider } from '../contexts/UserContext';
import { AidContextProvider } from '../contexts/AidContext';
import {BeneficiaryContextProvider} from '../contexts/BeneficiaryContext'

import AgencyRegistration from '../modules/agency/register';
import AuthWallet from '../modules/authentication/Wallet';
import PassportControl from '../modules/passport';
import SignUp from '../modules/authentication/SignUp';
import Approval from '../modules/authentication/Approval';

const App = () => {
	return (
		<AppContextProvider>
			<ToastProvider>
				<AidContextProvider>
					<BeneficiaryContextProvider>
					<UserContextProvider>
						<Router history={History}>
							<Switch>
								<Route exact path="/auth/wallet" component={AuthWallet} />
								<Route exact path="/sign_up" component={SignUp} />
								<Route exact path="/approval" component={Approval} />
								<Route path="/passport-control" component={PassportControl} />
								<Route path="/setup" component={AgencyRegistration} />
								{indexRoutes.map((prop, key) => {
									return <PrivateRoute path={prop.path} key={key} component={prop.component} />;
								})}
							</Switch>
						</Router>
					</UserContextProvider>
					</BeneficiaryContextProvider>
				</AidContextProvider>
			</ToastProvider>
		</AppContextProvider>
	);
};
export default App;
