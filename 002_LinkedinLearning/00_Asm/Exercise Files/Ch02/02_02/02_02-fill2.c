#include <stdio.h>

int main()
{
	const long megabyte = 1048576;
	unsigned char buffer[megabyte];
	long x;

	for(x=0; x<megabyte; x++ )
		buffer[x] = 0xaa;

	return 0;
}
