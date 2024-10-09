use dep::std::hash::pedersen_hash;
use dep::zkemail::{
    KEY_LIMBS_1024, get_body_hash_by_index, base64::body_hash_base64_decode,
    partial_hash::partial_sha256_var_end
};
use zkemail::dkim::verify_dkim_1024;
use dep::string_search::{SubString, StringBody, SubString32, SubString64, SubString128};

type StringBody1280 = StringBody<1302, 42, 1280>;
type StringBody1408 = StringBody<1426, 46, 1408>;

global MAX_EMAIL_HEADER_LENGTH: u32 = 1408;
global MAX_PARTIAL_EMAIL_BODY_LENGTH: u32 = 1280;




/**
 * @brief Total constraints: 361,913
 *
 *
 * @param header: Email headers that are signed by DKIM (sanitized as per DKIM spec); ASCII byte array; padded to max length
 * @param header_length: Length of the headers
 * @param partial_body: Email body after up to which SHA precompute is done; ASCII byte array; padded to max length
 * @param partial_body_length: Length of the partial body
 * @param full_body_length: Length of the full email body (with partial SHA)
 * @param partial_body_hash: 256-bit partial hash of the body (u32[8])
 * @param body_hash_index: Index at which the body hash (`bh=`) is present in the header (u32)
 * @param pubkey: 1024-bit public key limbs
 * @param pubkey_redc: 1024-bit public key reduction parameters limbs
 * @param signature: 1024-bit signature limbs
 * @param repo_name: Name of the repo; ASCII byte array; padded to max length
 * @param repo_name_length: Length of the repo name
 * @param pr_number: PR number; ASCII byte array of numeric characters; padded to max length
 * @param pr_number_length: Length of the PR number
 * @param email_address: User's email address; ASCII byte array; padded to max length
 * @param email_address_length: Length of the email address
 **/
fn main(
    header: [u8; MAX_EMAIL_HEADER_LENGTH],
    header_length: u32,
    partial_body: [u8; MAX_PARTIAL_EMAIL_BODY_LENGTH],
    partial_body_length: u32,
    full_body_length: u32,
    partial_body_hash: [u32; 8],
    body_hash_index: u32,
    pubkey: [Field; KEY_LIMBS_1024],
    pubkey_redc: [Field; KEY_LIMBS_1024],
    signature: [Field; KEY_LIMBS_1024],
    repo_name: pub [u8; 50],
    repo_name_length: u32,
    pr_number: [u8; 6],
    pr_number_length: u32,
    email_address: [u8; 60],
    email_address_length: u32,
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
        partial_body,
        partial_body_length as u64,
        full_body_length as u64
    );

    // check the body hashes match
    assert(signed_body_hash == computed_body_hash, "sha256 hash does not match");

    // Construct haystack from body to search for substrings
    let haystack: StringBody1280 = StringBody::new(partial_body, partial_body_length);

    // Assert repo name is in the body
    assert_repo_name_in_body(
        haystack,
        repo_name,
        repo_name_length,
        pr_number,
        pr_number_length
    );

    // Assert authored message is in the body
    assert_authored_msg_in_body(haystack);

    // We need to assert email address is in the header as that is used to calculate nullifier
    assert_email_address_in_header(header, header_length, email_address, email_address_length);

    // Calculate and return nullifier (hash(emailAddress))
    let mut email_addr_field: [Field; 60] = [0; 60];
    for i in 0..60 {
        email_addr_field[i] = email_address[i] as Field;
    }
    let nullifier = pedersen_hash(email_addr_field);
    nullifier
}

// PR merge notification email includes pull request URL at the footer JSON
// Format: "target": "https://github.com/{repo_org}/{repo_name}/pull/{pr_number}#event-XXX"}
// This function constructs the above string based on provided inputs, and asserts
// that the body contains this string.
fn assert_repo_name_in_body(
    haystack: StringBody1280,
    repo_name: [u8; 50],
    repo_name_length: u32,
    pr_number: [u8; 6],
    pr_number_length: u32
) {
    let mut pr_url: [u8; 128] = [0; 128];

    // Prefix - ,\r\n is to ensure that `target` starts at a new line
    let url_prefix = ",\r\n\"target\": \"https://github.com/".as_bytes();
    for i in 0..url_prefix.len() {
        pr_url[i] = url_prefix[i];
    }

    // Append repo name
    for i in 0..50 {
        if (i < repo_name_length) {
            pr_url[url_prefix.len() + i] = repo_name[i];
        }
    }

    // Append "/pull/"
    for i in 0..6 {
        pr_url[url_prefix.len() + repo_name_length + i] = "/pull/".as_bytes()[i];
    }

    // Append PR number
    for i in 0..6 {
        if (i < pr_number_length) {
            pr_url[url_prefix.len() + repo_name_length + 6 + i] = pr_number[i];
        }
    }

    // Total length
    let pr_url_length = url_prefix.len() + repo_name_length + 6 + pr_number_length;

    // String search in body

    let pr_url_substring: SubString128 = SubString::new(pr_url, pr_url_length);
    let (match_found2, pos): (bool, u32) = haystack.substring_match(pr_url_substring);

    assert(match_found2, "body does not contain pr url");

    // Assert value after pos is #event-
    let suffix = "#event-".as_bytes();
    for i in 0..6 {
        haystack.body[pos + pr_url_length + i] == suffix[i]
    }
}

fn assert_authored_msg_in_body(haystack: StringBody1280) {
    // This message ensure that person who received email is the one who created the PR
    let authored_msg = "because you authored the thread.<img".as_bytes();
    let authored_msg_substring: SubString64 = SubString::new(authored_msg, authored_msg.len());

    let (match_found, _): (bool, u32) = haystack.substring_match(authored_msg_substring);

    assert(match_found, "body does not contain authored msg");
}

// Email address of the user is present in the cc field
fn assert_email_address_in_header(
    header: [u8; MAX_EMAIL_HEADER_LENGTH],
    header_length: u32,
    email_address: [u8; 60],
    email_address_length: u32
) {
    // You will see "Cc: " in the email, but it gets converted to "cc:" during DKIM sanitization
    // Sanitized headers is what is signed by the DKIM key, and what is passed in `header` input
    let cc_prefix = "\ncc:".as_bytes();
    let cc_prefix_substring: SubString32 = SubString::new(cc_prefix, cc_prefix.len());
    let email_addr: SubString64 = SubString::new(email_address, email_address_length);
    let email_needle = cc_prefix_substring.concat_into(email_addr);

    let header_haystack: StringBody1408 = StringBody::new(header, header_length);
    let (email_found, email_pos): (bool, u32) = header_haystack.substring_match(email_needle);

    assert(email_found, "header does not contain email address");

    // Assert next value is comma
    assert(header[email_pos + cc_prefix.len() + email_address_length] == 44);
}
