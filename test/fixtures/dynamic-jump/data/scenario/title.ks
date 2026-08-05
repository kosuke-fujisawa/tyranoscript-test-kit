*start
#
Hello[p]

[eval exp="f.next_label = 'branch_a'"]
[jump target="&f.next_label"]

*branch_a
#
BranchA[p]

[jump target="*start"]

*unreachable_without_dynamic_skip
#
Unreachable[p]
