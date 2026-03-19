#![cfg(test)]
use soroban_sdk::{testutils::Address as _, vec, Address, Env, String};
use voting_contract::{VotingContract, VotingContractClient};

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

// ── Test 1: Proposals initialised correctly ────────────────────
#[test]
fn test_proposals_initialized() {
    let (env, client, _) = setup();
    assert_eq!(client.proposal_count(), 3);
    assert_eq!(
        client.get_proposal_name(&0),
        String::from_str(&env, "Alice")
    );
    assert_eq!(
        client.get_proposal_name(&1),
        String::from_str(&env, "Bob")
    );
}

// ── Test 2: Voting records votes correctly ─────────────────────
#[test]
fn test_vote_counts() {
    let (env, client, _) = setup();
    client.start_voting();

    let voter1 = Address::generate(&env);
    let voter2 = Address::generate(&env);
    client.vote(&voter1, &0); // vote Alice
    client.vote(&voter2, &0); // vote Alice

    assert_eq!(client.get_votes(&0), 2);
    assert_eq!(client.get_votes(&1), 0);
}

// ── Test 3: Double voting is rejected ──────────────────────────
#[test]
#[should_panic(expected = "Already voted")]
fn test_no_double_vote() {
    let (env, client, _) = setup();
    client.start_voting();
    let voter = Address::generate(&env);
    client.vote(&voter, &1);
    client.vote(&voter, &1); // should panic
}

// ── Test 4: Voting blocked when closed ─────────────────────────
#[test]
#[should_panic(expected = "Voting is not open")]
fn test_vote_when_closed() {
    let (env, client, _) = setup();
    // voting NOT started
    let voter = Address::generate(&env);
    client.vote(&voter, &0); // should panic
}

// ── Test 5: Winner is correct ──────────────────────────────────
#[test]
fn test_get_winner() {
    let (env, client, _) = setup();
    client.start_voting();

    let v1 = Address::generate(&env);
    let v2 = Address::generate(&env);
    let v3 = Address::generate(&env);
    client.vote(&v1, &2); // Charlie
    client.vote(&v2, &2); // Charlie
    client.vote(&v3, &1); // Bob

    client.end_voting();
    let (winner_index, winner_votes) = client.get_winner();
    assert_eq!(winner_index, 2); // Charlie
    assert_eq!(winner_votes, 2);
}