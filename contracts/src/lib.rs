#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype,
    symbol_short, Address, Env, String, Vec,
};

#[contracttype]
pub enum DataKey {
    Admin,
    VotingOpen,
    ProposalCount,
    ProposalName(u32),
    ProposalVotes(u32),
    HasVoted(Address),
}

#[contract]
pub struct VotingContract;

#[contractimpl]
impl VotingContract {
    pub fn initialize(env: Env, admin: Address, proposals: Vec<String>) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::VotingOpen, &false);
        let count = proposals.len();
        env.storage().instance().set(&DataKey::ProposalCount, &count);
        for (i, name) in proposals.iter().enumerate() {
            let idx = i as u32;
            env.storage().instance().set(&DataKey::ProposalName(idx), &name);
            env.storage().instance().set(&DataKey::ProposalVotes(idx), &0u32);
        }
    }

    pub fn start_voting(env: Env) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage().instance().set(&DataKey::VotingOpen, &true);
        env.events().publish((symbol_short!("started"),), ());
    }

    pub fn end_voting(env: Env) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage().instance().set(&DataKey::VotingOpen, &false);
        env.events().publish((symbol_short!("ended"),), ());
    }

    pub fn vote(env: Env, voter: Address, proposal_index: u32) {
        voter.require_auth();
        let open: bool = env.storage().instance()
            .get(&DataKey::VotingOpen).unwrap_or(false);
        if !open {
            panic!("Voting is not open");
        }
        let already_voted: bool = env.storage().instance()
            .get(&DataKey::HasVoted(voter.clone())).unwrap_or(false);
        if already_voted {
            panic!("Already voted");
        }
        let count: u32 = env.storage().instance()
            .get(&DataKey::ProposalCount).unwrap();
        if proposal_index >= count {
            panic!("Invalid proposal index");
        }
        let votes: u32 = env.storage().instance()
            .get(&DataKey::ProposalVotes(proposal_index)).unwrap_or(0);
        env.storage().instance().set(&DataKey::ProposalVotes(proposal_index), &(votes + 1));
        env.storage().instance().set(&DataKey::HasVoted(voter.clone()), &true);
        env.events().publish((symbol_short!("voted"),), (voter, proposal_index));
    }

    pub fn get_votes(env: Env, proposal_index: u32) -> u32 {
        env.storage().instance()
            .get(&DataKey::ProposalVotes(proposal_index)).unwrap_or(0)
    }

    pub fn get_proposal_name(env: Env, proposal_index: u32) -> String {
        env.storage().instance()
            .get(&DataKey::ProposalName(proposal_index)).unwrap()
    }

    pub fn proposal_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::ProposalCount).unwrap_or(0)
    }

    pub fn is_voting_open(env: Env) -> bool {
        env.storage().instance().get(&DataKey::VotingOpen).unwrap_or(false)
    }

    pub fn get_winner(env: Env) -> (u32, u32) {
        let open: bool = env.storage().instance()
            .get(&DataKey::VotingOpen).unwrap_or(false);
        if open {
            panic!("Voting still open");
        }
        let count: u32 = env.storage().instance()
            .get(&DataKey::ProposalCount).unwrap();
        let mut winner_index = 0u32;
        let mut winner_votes = 0u32;
        for i in 0..count {
            let v: u32 = env.storage().instance()
                .get(&DataKey::ProposalVotes(i)).unwrap_or(0);
            if v > winner_votes {
                winner_votes = v;
                winner_index = i;
            }
        }
        (winner_index, winner_votes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, vec, Address, Env, String};

    fn setup() -> (Env, VotingContractClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, VotingContract);
        let client = VotingContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let proposals = vec![
            &env,
            String::from_str(&env, "Alice"),
            String::from_str(&env, "Bob"),
            String::from_str(&env, "Charlie"),
        ];
        client.initialize(&admin, &proposals);
        (env, client, admin)
    }

    #[test]
    fn test_proposals_initialized() {
        let (env, client, _) = setup();
        assert_eq!(client.proposal_count(), 3);
        assert_eq!(client.get_proposal_name(&0), String::from_str(&env, "Alice"));
    }

    #[test]
    fn test_vote_counts() {
        let (env, client, _) = setup();
        client.start_voting();
        let voter1 = Address::generate(&env);
        let voter2 = Address::generate(&env);
        client.vote(&voter1, &0);
        client.vote(&voter2, &0);
        assert_eq!(client.get_votes(&0), 2);
        assert_eq!(client.get_votes(&1), 0);
    }

    #[test]
    #[should_panic(expected = "Already voted")]
    fn test_no_double_vote() {
        let (env, client, _) = setup();
        client.start_voting();
        let voter = Address::generate(&env);
        client.vote(&voter, &1);
        client.vote(&voter, &1);
    }

    #[test]
    #[should_panic(expected = "Voting is not open")]
    fn test_vote_when_closed() {
        let (env, client, _) = setup();
        let voter = Address::generate(&env);
        client.vote(&voter, &0);
    }

    #[test]
    fn test_get_winner() {
        let (env, client, _) = setup();
        client.start_voting();
        let v1 = Address::generate(&env);
        let v2 = Address::generate(&env);
        let v3 = Address::generate(&env);
        client.vote(&v1, &2);
        client.vote(&v2, &2);
        client.vote(&v3, &1);
        client.end_voting();
        let (winner_index, winner_votes) = client.get_winner();
        assert_eq!(winner_index, 2);
        assert_eq!(winner_votes, 2);
    }
}
