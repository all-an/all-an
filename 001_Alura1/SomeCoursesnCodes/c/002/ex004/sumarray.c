#include <stdio.h>

int soma(int* nums, int tam) {
    int total = 0;

    for(int i = 0; i < tam; i++) {
        total += nums[i];
    }
    printf("%d", total);
    return total;
}


int main(){
    int nums[3];
    nums[0] = 10;
    nums[1] = 20;
    nums[2] = 30;

    int total = soma(nums, 3);
    soma(3, 3);
}

/*  // MEU CÓDIGO TODO ERRADO
#include <stdio.h>

int soma(int* nums[3], int i){
    int* total;
    for(int i = 0; i <= i; i++){
        *total = *total + nums[i];
        printf("%d", *total);
    }
}

int main(){
    int nums[3];
    nums[0] = 10;
    nums[1] = 20;
    nums[2] = 30;

    int total = soma(nums, 3);
    soma(3, 3);
}
*/
