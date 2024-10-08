use dep::std::hash::pedersen_hash;
use dep::zkemail::{
    KEY_LIMBS_1024, get_body_hash_by_index, base64::body_hash_base64_decode,
    partial_hash::partial_sha256_var_end
};
use zkemail::dkim::verify_dkim_1024;
use dep::string_search::{SubString, StringBody, SubString32, SubString64, SubString128};

type StringBody1280 = StringBody<1302, 42, 1280>;

global MAX_EMAIL_HEADER_LENGTH: u32 = 1280;
global MAX_PARTIAL_EMAIL_BODY_LENGTH: u32 = 1280;

fn main(
    body_hash_index: u32,
    header: [u8; MAX_EMAIL_HEADER_LENGTH],
    header_length: u32,
    body: [u8; MAX_PARTIAL_EMAIL_BODY_LENGTH],
    body_length: u32,
    partial_body_hash: [u32; 8],
    partial_body_length: u32,
    pubkey: [Field; KEY_LIMBS_1024],
    pubkey_redc: [Field; KEY_LIMBS_1024],
    signature: [Field; KEY_LIMBS_1024],
    pull_request_url: [u8; 64],
    pull_request_url_length: u32,
    wallet_address: Field
) -> pub Field {
    // check the body and header lengths are within bounds
    assert(header_length <= MAX_EMAIL_HEADER_LENGTH, "header exceeds max length");
    assert(partial_body_length <= MAX_PARTIAL_EMAIL_BODY_LENGTH, "body exceeds max length");
    wallet_address.assert_max_bit_size(160);

    // verify the dkim signature over the header
    verify_dkim_1024(header, header_length, pubkey, pubkey_redc, signature);

    // manually extract the body hash from the header
    let body_hash_encoded = get_body_hash_by_index(header, body_hash_index);
    let signed_body_hash: [u8; 32] = body_hash_base64_decode(body_hash_encoded);

    // finish the partial hash
    let computed_body_hash = partial_sha256_var_end(
        partial_body_hash,
        body,
        partial_body_length as u64,
        body_length as u64
    );

    // check the body hashes match
    assert(signed_body_hash == computed_body_hash, "sha256 hash does not match");

    // assert "because you authored the thread.<img" is in the body
    let authored_msg = "because you authored the thread.<img".as_bytes();
    let authored_msg_substring: SubString64 = SubString::new(authored_msg, authored_msg.len());

    let haystack: StringBody1280 = StringBody::new(body, partial_body_length);
    let (match_found, _): (bool, u32) = haystack.substring_match(authored_msg_substring);
    assert(match_found, "body does not contain authored msg");

    // assert the repo name + pr num is is present
    let target_prefix = ",\r\n\"target\": \"".as_bytes();
    let target_prefix_substring: SubString32 = SubString::new(target_prefix, target_prefix.len());
    let pr_substring: SubString128 = SubString::new(pull_request_url, pull_request_url_length);
    let pr_needle = target_prefix_substring.concat_into(pr_substring);
    let (match_found2, pos): (bool, u32) = haystack.substring_match(pr_needle);
    assert(match_found2, "body does not contain pr url");

    let suffix = "#event-".as_bytes();
    for i in 0..6 {
        body[pos + pr_needle.len() + i] == suffix[i]
    }

    let mut event_id : [Field; 12] = [0; 12];
    for i in 0..12 {
        event_id[i] = body[pos + pr_needle.len() + 6 + i] as Field;
    }

    let nullifier = pedersen_hash(event_id);

    nullifier
}
