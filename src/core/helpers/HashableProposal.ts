/**
 * core.api.HashableProposal
 *
 */
import { ProposalCreateRequest } from '../../api/requests/ProposalCreateRequest';

export class HashableProposal {

    public submitter: string;
    public blockStart: number;
    public blockEnd: number;
    public type: string;
    public description: string;
    public options: string;

    constructor(hashThis: ProposalCreateRequest) {
        const input = JSON.parse(JSON.stringify(hashThis));

        if (input) {
            this.submitter = input.submitter;
            this.blockStart = input.blockStart;
            this.blockEnd = input.blockEnd;
            this.type = input.type;
            this.description = input.description;

            this.options = '';

            input.options = input.options || [];
            for (const option of input.options) {
                this.options = this.options + option.optionId + ':' + option.description + ':';
            }
        }
    }

}
